<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BusinessRuleException;
use App\Services\Num;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Sales: paged list (replaces the client-side filtering in sales.list.tsx),
 * invoice bundle, POS checkout, payment collection and returns.
 *
 * due = total - paid. due > 0 Due/Partial, due < 0 Advance, due <= 0 && paid > 0 Paid.
 */
class SaleController extends Controller
{
    public function __construct(private readonly StockService $stock) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'payment' => ['nullable', 'in:due,advance,paid,partial'],
            'q' => ['nullable', 'string', 'max:120'],
            'customer' => ['nullable', 'uuid'],
            'cashier' => ['nullable', 'uuid'],
        ]);

        [$limit, $offset] = $this->paginationParams($request);
        $showroomId = $this->location($request);

        $q = DB::table('sales as s')->leftJoin('showrooms as sh', 'sh.id', '=', 's.showroom_id');
        $q = $showroomId === null ? $q->whereNull('s.showroom_id') : $q->where('s.showroom_id', $showroomId);

        if (! empty($data['from'])) {
            $q->where('s.created_at', '>=', $data['from']);
        }
        if (! empty($data['to'])) {
            $q->where('s.created_at', '<=', $data['to']);
        }
        if (! empty($data['customer'])) {
            $q->where('s.customer_id', $data['customer']);
        }
        if (! empty($data['cashier'])) {
            $q->where('s.cashier_id', $data['cashier']);
        }
        if (! empty($data['q'])) {
            $like = '%'.$data['q'].'%';
            $q->where(function ($w) use ($like) {
                $w->where('s.customer_name', 'like', $like)
                    ->orWhere('s.customer_phone', 'like', $like)
                    ->orWhere('s.external_ref', 'like', $like)
                    ->orWhere('s.id', 'like', $like);
            });
        }

        match ($data['payment'] ?? null) {
            'due' => $q->where('s.due', '>', 0),
            'advance' => $q->where('s.due', '<', 0),
            'paid' => $q->where('s.paid', '>', 0)->where('s.due', '<=', 0),
            'partial' => $q->where('s.paid', '>', 0)->where('s.due', '>', 0),
            default => null,
        };

        $total = (clone $q)->count();

        $sums = (clone $q)->selectRaw('SUM(s.total) as total_amount, SUM(s.paid) as paid_amount, SUM(s.due) as due_amount')->first();

        $rows = $q->orderByDesc('s.created_at')->limit($limit)->offset($offset)->get([
            's.id', 's.external_ref', 's.showroom_id', 'sh.name as showroom_name',
            's.customer_id', 's.customer_name', 's.customer_phone', 's.cashier_id',
            's.subtotal', 's.discount', 's.tax', 's.shipping', 's.total', 's.paid', 's.due',
            's.payment_mode', 's.created_at',
        ]);

        $saleIds = $rows->pluck('id')->all();
        $itemCounts = $saleIds === [] ? collect() : DB::table('sale_items')
            ->whereIn('sale_id', $saleIds)
            ->groupBy('sale_id')
            ->get([DB::raw('sale_id'), DB::raw('SUM(qty) as qty'), DB::raw('COUNT(*) as lines')])
            ->keyBy('sale_id');

        $out = $rows->map(function ($r) use ($itemCounts) {
            $c = $itemCounts->get($r->id);

            return (array) $r + [
                'item_qty' => (float) ($c->qty ?? 0),
                'item_lines' => (int) ($c->lines ?? 0),
                'payment_status' => $this->paymentStatus((float) $r->total, (float) $r->paid, (float) $r->due),
            ];
        });

        return response()->json([
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'totals' => [
                'amount' => round((float) ($sums->total_amount ?? 0), 2),
                'paid' => round((float) ($sums->paid_amount ?? 0), 2),
                'due' => round((float) ($sums->due_amount ?? 0), 2),
            ],
            'rows' => $out,
        ]);
    }

    /** Everything an invoice print needs — replaces get_invoice_bundle(). */
    public function show(Request $request, string $id): JsonResponse
    {
        $sale = DB::table('sales')->where('id', $id)->first();
        if (! $sale) {
            throw new BusinessRuleException("Sale {$id} not found");
        }

        return response()->json([
            'sale' => $sale,
            'items' => DB::table('sale_items')->where('sale_id', $id)->orderBy('created_at')->get(),
            'payments' => DB::table('sale_payments')->where('sale_id', $id)->orderBy('created_at')->get(),
            'returns' => DB::table('sale_returns')->where('sale_id', $id)->orderBy('created_at')->get(),
            'showroom' => DB::table('showrooms')->where('id', $sale->showroom_id)->first(),
            'company' => DB::table('company_settings')->where('is_current', true)->first(),
        ]);
    }

    /** POS checkout: sale + lines + payment + stock out, all in one transaction. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customerId' => ['nullable', 'uuid'],
            'customerName' => ['nullable', 'string', 'max:160'],
            'customerPhone' => ['nullable', 'string', 'max:40'],
            'registerId' => ['nullable', 'uuid'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'tax' => ['nullable', 'numeric', 'min:0'],
            'shipping' => ['nullable', 'numeric', 'min:0'],
            'paid' => ['nullable', 'numeric', 'min:0'],
            'paymentMode' => ['nullable', 'string', 'max:40'],
            'externalRef' => ['nullable', 'string', 'max:60'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.productId' => ['required', 'uuid'],
            'items.*.qty' => ['required', 'numeric', 'gt:0'],
            'items.*.unitPrice' => ['required', 'numeric', 'min:0'],
            // Optional multi-tender split; when sent it replaces the single paid row.
            'payments' => ['nullable', 'array'],
            'payments.*.method' => ['required', 'string', 'max:40'],
            'payments.*.amount' => ['required', 'numeric', 'gt:0'],
            'payments.*.reference' => ['nullable', 'string', 'max:80'],
        ]);

        $showroomId = $this->location($request);
        $user = $request->user();

        return DB::transaction(function () use ($data, $showroomId, $user) {
            $saleId = (string) Str::uuid();
            $subtotal = '0';
            $lines = [];

            foreach ($data['items'] as $item) {
                $product = DB::table('products')->where('id', $item['productId'])->first(['id', 'name', 'sku']);
                if (! $product) {
                    throw new BusinessRuleException('Product not found');
                }

                $lineTotal = Num::money(Num::mul($item['qty'], $item['unitPrice']));
                $subtotal = Num::add($subtotal, $lineTotal);

                $lines[] = [
                    'id' => (string) Str::uuid(),
                    'sale_id' => $saleId,
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'product_sku' => $product->sku,
                    'qty' => Num::qty($item['qty']),
                    'unit_price' => Num::money($item['unitPrice']),
                    'line_total' => $lineTotal,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            $discount = Num::money($data['discount'] ?? 0);
            $tax = Num::money($data['tax'] ?? 0);
            $shipping = Num::money($data['shipping'] ?? 0);
            $total = Num::money(Num::add(Num::add(Num::sub($subtotal, $discount), $tax), $shipping));
            $paid = Num::money($data['paid'] ?? 0);
            $due = Num::money(Num::sub($total, $paid));

            DB::table('sales')->insert([
                'id' => $saleId,
                'external_ref' => $data['externalRef'] ?? null,
                'showroom_id' => $showroomId,
                'register_id' => $data['registerId'] ?? null,
                'cashier_id' => $user?->id,
                'customer_id' => $data['customerId'] ?? null,
                'customer_name' => $data['customerName'] ?? null,
                'customer_phone' => $data['customerPhone'] ?? null,
                'subtotal' => Num::money($subtotal),
                'discount' => $discount,
                'tax' => $tax,
                'shipping' => $shipping,
                'total' => $total,
                'paid' => $paid,
                'due' => $due,
                'payment_mode' => $data['paymentMode'] ?? 'cash',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('sale_items')->insert($lines);

            if (! empty($data['payments'])) {
                foreach ($data['payments'] as $pay) {
                    DB::table('sale_payments')->insert([
                        'id' => (string) Str::uuid(),
                        'sale_id' => $saleId,
                        'method' => $pay['method'],
                        'amount' => Num::money($pay['amount']),
                        'reference' => $pay['reference'] ?? null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            } elseif (Num::cmp($paid, 0) > 0) {
                DB::table('sale_payments')->insert([
                    'id' => (string) Str::uuid(),
                    'sale_id' => $saleId,
                    'method' => $data['paymentMode'] ?? 'cash',
                    'amount' => $paid,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            // Stock out, one movement per line — checks availability itself.
            foreach ($data['items'] as $item) {
                $this->stock->productMovement($user, $item['productId'], $showroomId,
                    Num::neg(Num::abs($item['qty'])), 'sale', 'sale', $saleId, null);
            }

            return response()->json(['id' => $saleId], 201);
        });
    }

    /** Collect money against an existing invoice. */
    public function addPayment(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'string', 'max:40'],
            'reference' => ['nullable', 'string', 'max:80'],
            'note' => ['nullable', 'string', 'max:500'],
            'paidOn' => ['nullable', 'date'],
        ]);

        $user = $request->user();

        return DB::transaction(function () use ($data, $id, $user) {
            $sale = DB::table('sales')->where('id', $id)->lockForUpdate()->first();
            if (! $sale) {
                throw new BusinessRuleException("Sale {$id} not found");
            }

            $paid = Num::add($sale->paid, $data['amount']);

            DB::table('sales')->where('id', $id)->update([
                'paid' => Num::money($paid),
                'due' => Num::money(Num::sub($sale->total, $paid)),
                'updated_at' => now(),
            ]);

            DB::table('sale_payments')->insert([
                'id' => (string) Str::uuid(),
                'sale_id' => $id,
                'method' => $data['method'] ?? 'cash',
                'amount' => Num::money($data['amount']),
                'reference' => $data['reference'] ?? null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('customer_payments')->insert([
                'id' => (string) Str::uuid(),
                'customer_id' => $sale->customer_id,
                'sale_id' => $id,
                'showroom_id' => $sale->showroom_id,
                'invoice_ref' => $sale->external_ref,
                'customer_name' => $sale->customer_name,
                'customer_phone' => $sale->customer_phone,
                'amount' => Num::money($data['amount']),
                'method' => $data['method'] ?? 'cash',
                'reference' => $data['reference'] ?? null,
                'note' => $data['note'] ?? null,
                'paid_on' => $data['paidOn'] ?? now()->toDateString(),
                'created_by' => $user?->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return response()->json(['ok' => true], 201);
        });
    }

    /** Sale return. condition=good puts stock back, condition=damaged goes to damaged stock. */
    /** POS edit: return old qty to stock, take new qty, replace lines; paid is kept, due recomputed. */
    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'customerId' => ['nullable', 'uuid'],
            'customerName' => ['nullable', 'string', 'max:160'],
            'customerPhone' => ['nullable', 'string', 'max:40'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'shipping' => ['nullable', 'numeric', 'min:0'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.productId' => ['required', 'uuid'],
            'items.*.qty' => ['required', 'numeric', 'gt:0'],
            'items.*.unitPrice' => ['required', 'numeric', 'min:0'],
        ]);
        $user = $request->user();

        return DB::transaction(function () use ($data, $id, $user) {
            $sale = DB::table('sales')->where('id', $id)->lockForUpdate()->first();
            if (! $sale) {
                throw new BusinessRuleException("Sale {$id} not found");
            }
            $old = [];
            foreach (DB::table('sale_items')->where('sale_id', $id)->get(['product_id', 'qty']) as $r) {
                if ($r->product_id) {
                    $old[$r->product_id] = Num::add($old[$r->product_id] ?? '0', (string) $r->qty);
                }
            }
            $new = [];
            $subtotal = '0';
            $lines = [];
            foreach ($data['items'] as $item) {
                $product = DB::table('products')->where('id', $item['productId'])->first(['id', 'name', 'sku']);
                if (! $product) {
                    throw new BusinessRuleException('Product not found');
                }
                $lineTotal = Num::money(Num::mul($item['qty'], $item['unitPrice']));
                $subtotal = Num::add($subtotal, $lineTotal);
                $new[$product->id] = Num::add($new[$product->id] ?? '0', (string) $item['qty']);
                $lines[] = [
                    'id' => (string) Str::uuid(), 'sale_id' => $id,
                    'product_id' => $product->id, 'product_name' => $product->name, 'product_sku' => $product->sku,
                    'qty' => Num::qty($item['qty']), 'unit_price' => Num::money($item['unitPrice']),
                    'line_total' => $lineTotal, 'created_at' => now(), 'updated_at' => now(),
                ];
            }
            foreach (array_unique(array_merge(array_keys($old), array_keys($new))) as $pid) {
                $delta = Num::sub($old[$pid] ?? '0', $new[$pid] ?? '0'); // positive = back to stock
                if (Num::cmp($delta, '0') !== 0) {
                    $this->stock->productMovement($user, $pid, $sale->showroom_id, $delta, 'sale_edit', 'sale', $id, 'POS edit');
                }
            }
            DB::table('sale_items')->where('sale_id', $id)->delete();
            DB::table('sale_items')->insert($lines);

            $discount = Num::money($data['discount'] ?? 0);
            $shipping = Num::money($data['shipping'] ?? 0);
            $total = Num::money(Num::add(Num::sub($subtotal, $discount), $shipping));
            $paid = Num::money((string) $sale->paid);
            $due = Num::sub($total, $paid);
            if (Num::cmp($due, '0') < 0) {
                $due = '0';
            }
            DB::table('sales')->where('id', $id)->update([
                'customer_id' => $data['customerId'] ?? null,
                'customer_name' => $data['customerName'] ?: 'Walk-in Customer',
                'customer_phone' => $data['customerPhone'] ?? null,
                'subtotal' => Num::money($subtotal), 'discount' => $discount, 'tax' => '0.00',
                'shipping' => $shipping, 'total' => $total, 'due' => Num::money($due),
                'updated_at' => now(),
            ]);

            return response()->json(['id' => $id, 'total' => (float) $total]);
        });
    }

    /** Outstanding due of a customer: sales.due (by id or same phone digits) minus standalone payments. */
    public function customerDue(Request $request): JsonResponse
    {
        $data = $request->validate(['customer_id' => ['required', 'uuid'], 'phone' => ['nullable', 'string', 'max:40']]);
        $digits = preg_replace('/\D/', '', (string) ($data['phone'] ?? ''));
        $match = function ($q) use ($data, $digits) {
            $q->where('customer_id', $data['customer_id']);
            if ($digits !== '') {
                $q->orWhereRaw("REGEXP_REPLACE(COALESCE(customer_phone,''), '[^0-9]', '') = ?", [$digits]);
            }
        };
        $salesDue = (string) (DB::table('sales')->where($match)->sum('due') ?? '0');
        $extra = (string) (DB::table('customer_payments')->whereNull('sale_id')->where($match)->sum('amount') ?? '0');
        $out = Num::sub($salesDue, $extra);

        return response()->json(['due' => Num::cmp($out, '0') > 0 ? (float) Num::money($out) : 0]);
    }

    public function storeReturn(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:200'],
            'note' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.saleItemId' => ['nullable', 'uuid'],
            'items.*.productId' => ['required', 'uuid'],
            'items.*.qty' => ['required', 'numeric', 'gt:0'],
            'items.*.lineTotal' => ['required', 'numeric', 'min:0'],
            'items.*.condition' => ['required', 'in:good,damaged'],
        ]);

        $user = $request->user();

        return DB::transaction(function () use ($data, $id, $user) {
            $sale = DB::table('sales')->where('id', $id)->first();
            if (! $sale) {
                throw new BusinessRuleException("Sale {$id} not found");
            }

            $returnId = (string) Str::uuid();
            $amount = '0';

            foreach ($data['items'] as $item) {
                $amount = Num::add($amount, $item['lineTotal']);
            }

            DB::table('sale_returns')->insert([
                'id' => $returnId,
                'code' => 'SR-'.strtoupper(Str::substr($returnId, 0, 8)),
                'sale_id' => $id,
                'invoice_ref' => $sale->external_ref,
                'customer_name' => $sale->customer_name,
                'amount' => Num::money($amount),
                'reason' => $data['reason'] ?? null,
                'showroom_id' => $sale->showroom_id,
                'note' => $data['note'] ?? null,
                'created_by' => $user?->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ($data['items'] as $item) {
                $name = DB::table('products')->where('id', $item['productId'])->value('name');

                DB::table('sale_return_items')->insert([
                    'id' => (string) Str::uuid(),
                    'return_id' => $returnId,
                    'sale_item_id' => $item['saleItemId'] ?? null,
                    'product_id' => $item['productId'],
                    'product_name' => $name,
                    'qty' => Num::qty($item['qty']),
                    'line_total' => Num::money($item['lineTotal']),
                    'condition' => $item['condition'],
                    'created_at' => now(),
                ]);

                if ($item['condition'] === 'good') {
                    $this->stock->productMovement($user, $item['productId'], $sale->showroom_id,
                        Num::abs($item['qty']), 'return_in', 'sale_return', $returnId, null);
                } else {
                    $this->stock->damagedMovement($user, $item['productId'], $sale->showroom_id,
                        Num::abs($item['qty']), 'damaged_in', 'sale_return', $returnId, null);
                }
            }

            return response()->json(['id' => $returnId], 201);
        });
    }

    private function paymentStatus(float $total, float $paid, float $due): string
    {
        if ($due < 0) {
            return 'Advance';
        }
        if ($due > 0) {
            return $paid > 0 ? 'Partial' : 'Due';
        }

        return $paid > 0 ? 'Paid' : 'Due';
    }
}
