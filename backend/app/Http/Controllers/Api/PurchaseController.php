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
 * Raw material purchasing. Purchases only ever land in the factory store
 * (showroom_id NULL) — the same guard sql/26 enforced.
 */
class PurchaseController extends Controller
{
    public function __construct(private readonly StockService $stock) {}

    public function index(Request $request): JsonResponse
    {
        [$limit, $offset] = $this->paginationParams($request);

        $q = DB::table('purchases as p')
            ->leftJoin('suppliers as s', 's.id', '=', 'p.supplier_id')
            ->leftJoin('purchase_categories as c', 'c.id', '=', 'p.category_id');

        $showroomId = $this->location($request);
        $q = $showroomId === null ? $q->whereNull('p.showroom_id') : $q->where('p.showroom_id', $showroomId);

        if ($from = $request->query('from')) {
            $q->where('p.purchase_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('p.purchase_date', '<=', $to);
        }
        if ($supplier = $request->query('supplier')) {
            $q->where('p.supplier_id', $supplier);
        }
        if ($status = $request->query('status')) {
            $q->where('p.status', $status);
        }
        if ($search = $request->query('q')) {
            $like = '%'.$search.'%';
            $q->where(fn ($w) => $w->where('p.code', 'like', $like)->orWhere('s.name', 'like', $like));
        }

        $total = (clone $q)->count();
        $sums = (clone $q)->selectRaw('SUM(p.total) as total_amount, SUM(p.paid) as paid_amount, SUM(p.due) as due_amount')->first();

        $rows = $q->orderByDesc('p.purchase_date')->orderByDesc('p.created_at')
            ->limit($limit)->offset($offset)->get([
                'p.id', 'p.code', 'p.purchase_date', 'p.supplier_id', 's.name as supplier_name',
                'c.name as category_name', 'p.subtotal', 'p.discount', 'p.tax', 'p.total',
                'p.paid', 'p.due', 'p.status', 'p.payment', 'p.created_at',
            ]);

        // Item lines for the page's purchases in one query (no N+1).
        $items = DB::table('purchase_items')->whereIn('purchase_id', $rows->pluck('id'))
            ->orderBy('created_at')->get(['purchase_id', 'material_id', 'product_id', 'name', 'unit', 'qty', 'price'])
            ->groupBy('purchase_id');
        foreach ($rows as $r) {
            $r->items = array_values(($items[$r->id] ?? collect())->all());
        }

        return response()->json([
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'totals' => [
                'amount' => round((float) ($sums->total_amount ?? 0), 2),
                'paid' => round((float) ($sums->paid_amount ?? 0), 2),
                'due' => round((float) ($sums->due_amount ?? 0), 2),
            ],
            'rows' => $rows,
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $purchase = DB::table('purchases')->where('id', $id)->first();
        if (! $purchase) {
            throw new BusinessRuleException("Purchase {$id} not found");
        }

        return response()->json([
            'purchase' => $purchase,
            'supplier' => DB::table('suppliers')->where('id', $purchase->supplier_id)->first(),
            'items' => DB::table('purchase_items')->where('purchase_id', $id)->orderBy('created_at')->get(),
            'payments' => DB::table('supplier_payments')->where('purchase_id', $id)->orderBy('paid_on')->get(),
            'returns' => DB::table('purchase_returns')->where('purchase_id', $id)->orderBy('created_at')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->rules($request);
        $user = $request->user();

        return DB::transaction(function () use ($data, $user) {
            $id = (string) Str::uuid();
            $this->writePurchase($id, $data, $user?->id, insert: true);
            $this->applyItems($id, $data['items'], $user);

            return response()->json(['id' => $id], 201);
        });
    }

    /** Edit = reverse the old material intake, then apply the new lines. */
    public function update(Request $request, string $id): JsonResponse
    {
        $data = $this->rules($request);
        $user = $request->user();

        return DB::transaction(function () use ($data, $id, $user) {
            $purchase = DB::table('purchases')->where('id', $id)->first();
            if (! $purchase) {
                throw new BusinessRuleException("Purchase {$id} not found");
            }

            $this->reverseItems($id, $user);
            $this->writePurchase($id, $data, $purchase->created_by, insert: false);
            $this->applyItems($id, $data['items'], $user);

            return response()->json(['id' => $id]);
        });
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $request->user();

        return DB::transaction(function () use ($id, $user) {
            if (! DB::table('purchases')->where('id', $id)->exists()) {
                throw new BusinessRuleException("Purchase {$id} not found");
            }

            $this->reverseItems($id, $user);
            DB::table('purchase_items')->where('purchase_id', $id)->delete();
            DB::table('purchases')->where('id', $id)->delete();

            return response()->json(['ok' => true]);
        });
    }

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
            $purchase = DB::table('purchases')->where('id', $id)->lockForUpdate()->first();
            if (! $purchase) {
                throw new BusinessRuleException("Purchase {$id} not found");
            }

            $paid = Num::add($purchase->paid, $data['amount']);
            $due = Num::sub($purchase->total, $paid);

            DB::table('purchases')->where('id', $id)->update([
                'paid' => Num::money($paid),
                'due' => Num::money($due),
                'status' => Num::cmp($due, 0) <= 0 ? 'paid' : 'partial',
                'updated_at' => now(),
            ]);

            DB::table('supplier_payments')->insert([
                'id' => (string) Str::uuid(),
                'supplier_id' => $purchase->supplier_id,
                'purchase_id' => $id,
                'showroom_id' => $purchase->showroom_id,
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

    /** Send materials back to the supplier. */
    public function storeReturn(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:200'],
            'note' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.materialId' => ['nullable', 'uuid'],
            'items.*.productId' => ['nullable', 'uuid'],
            'items.*.qty' => ['required', 'numeric', 'gt:0'],
            'items.*.price' => ['required', 'numeric', 'min:0'],
        ]);

        $user = $request->user();

        return DB::transaction(function () use ($data, $id, $user) {
            $purchase = DB::table('purchases')->where('id', $id)->first();
            if (! $purchase) {
                throw new BusinessRuleException("Purchase {$id} not found");
            }

            $returnId = (string) Str::uuid();
            $amount = '0';
            foreach ($data['items'] as $item) {
                $amount = Num::add($amount, Num::mul($item['qty'], $item['price']));
            }

            DB::table('purchase_returns')->insert([
                'id' => $returnId,
                'code' => 'PR-'.strtoupper(Str::substr($returnId, 0, 8)),
                'purchase_id' => $id,
                'supplier_id' => $purchase->supplier_id,
                'showroom_id' => $purchase->showroom_id,
                'amount' => Num::money($amount),
                'reason' => $data['reason'] ?? null,
                'invoice_ref' => $purchase->code,
                'note' => $data['note'] ?? null,
                'created_by' => $user?->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ($data['items'] as $item) {
                $materialId = $item['materialId'] ?? null;
                $productId = $item['productId'] ?? null;
                if (($materialId === null) === ($productId === null)) {
                    throw new BusinessRuleException('Each line needs either a raw material or a product');
                }

                $name = $materialId !== null
                    ? DB::table('raw_materials')->where('id', $materialId)->value('name')
                    : DB::table('products')->where('id', $productId)->value('name');

                DB::table('purchase_return_items')->insert([
                    'id' => (string) Str::uuid(),
                    'return_id' => $returnId,
                    'material_id' => $materialId,
                    'product_id' => $productId,
                    'name' => $name,
                    'qty' => Num::qty($item['qty']),
                    'price' => Num::money($item['price']),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                if ($materialId !== null) {
                    $this->stock->rawMovement($user, $materialId, $purchase->showroom_id,
                        Num::neg(Num::abs($item['qty'])), 'purchase_return_out', 'purchase_return', $returnId, null);
                } else {
                    $this->stock->productMovement($user, $productId, $purchase->showroom_id,
                        Num::neg(Num::abs($item['qty'])), 'purchase_return_out', 'purchase_return', $returnId, null);
                }
            }

            return response()->json(['id' => $returnId], 201);
        });
    }

    /** Purchase returns list for the current location (with supplier name and line count). */
    public function returnsIndex(Request $request): JsonResponse
    {
        $showroomId = $this->location($request);
        $q = DB::table('purchase_returns as r')->leftJoin('suppliers as s', 's.id', '=', 'r.supplier_id');
        $q = $showroomId === null ? $q->whereNull('r.showroom_id') : $q->where('r.showroom_id', $showroomId);
        $rows = $q->orderByDesc('r.created_at')->limit(1000)->get([
            'r.id', 'r.code', 'r.created_at', 'r.purchase_id', 'r.invoice_ref', 'r.amount',
            'r.reason', 'r.showroom_id', 's.name as supplier_name',
            DB::raw('(SELECT COUNT(*) FROM purchase_return_items i WHERE i.return_id = r.id) as item_count'),
        ]);

        return response()->json(['rows' => $rows]);
    }

    public function destroyReturn(Request $request, string $id): JsonResponse
    {
        $showroomId = $this->location($request);
        $q = DB::table('purchase_returns')->where('id', $id);
        $q = $showroomId === null ? $q->whereNull('showroom_id') : $q->where('showroom_id', $showroomId);
        $q->delete();

        return response()->json(['ok' => true]);
    }

    /** Supplier payments list for the current location. */
    public function paymentsIndex(Request $request): JsonResponse
    {
        $showroomId = $this->location($request);
        $q = DB::table('supplier_payments as sp')
            ->leftJoin('suppliers as s', 's.id', '=', 'sp.supplier_id')
            ->leftJoin('purchases as p', 'p.id', '=', 'sp.purchase_id');
        $q = $showroomId === null ? $q->whereNull('sp.showroom_id') : $q->where('sp.showroom_id', $showroomId);
        $rows = $q->orderByDesc('sp.paid_on')->orderByDesc('sp.created_at')->limit(2000)->get([
            'sp.id', 'sp.paid_on', 'sp.amount', 'sp.method', 'sp.reference', 'sp.note', 'sp.showroom_id',
            'sp.supplier_id', 'sp.purchase_id', 's.name as supplier_name', 'p.code as purchase_code',
        ]);

        return response()->json(['rows' => $rows]);
    }

    /** Payment not tied to a purchase (on account). Purchase-linked payments use addPayment. */
    public function storeSupplierPayment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplierId' => ['required', 'uuid'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['nullable', 'string', 'max:40'],
            'reference' => ['nullable', 'string', 'max:80'],
            'note' => ['nullable', 'string', 'max:500'],
            'paidOn' => ['nullable', 'date'],
        ]);
        DB::table('supplier_payments')->insert([
            'id' => (string) Str::uuid(),
            'supplier_id' => $data['supplierId'],
            'purchase_id' => null,
            'showroom_id' => $this->location($request),
            'amount' => Num::money($data['amount']),
            'method' => $data['method'] ?? 'cash',
            'reference' => $data['reference'] ?? null,
            'note' => $data['note'] ?? null,
            'paid_on' => $data['paidOn'] ?? now()->toDateString(),
            'created_by' => $request->user()?->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['ok' => true], 201);
    }

    public function destroySupplierPayment(Request $request, string $id): JsonResponse
    {
        $showroomId = $this->location($request);
        $q = DB::table('supplier_payments')->where('id', $id);
        $q = $showroomId === null ? $q->whereNull('showroom_id') : $q->where('showroom_id', $showroomId);
        $q->delete();

        return response()->json(['ok' => true]);
    }

    // -------------------------------------------------------------------

    private function rules(Request $request): array
    {
        return $request->validate([
            'supplierId' => ['nullable', 'uuid'],
            'categoryId' => ['nullable', 'uuid'],
            'purchaseDate' => ['required', 'date'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'tax' => ['nullable', 'numeric', 'min:0'],
            'paid' => ['nullable', 'numeric', 'min:0'],
            'payment' => ['nullable', 'string', 'max:40'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.materialId' => ['nullable', 'uuid'],
            'items.*.productId' => ['nullable', 'uuid'],
            'items.*.qty' => ['required', 'numeric', 'gt:0'],
            'items.*.price' => ['required', 'numeric', 'min:0'],
        ]);
    }

    private function writePurchase(string $id, array $data, ?string $createdBy, bool $insert): void
    {
        $subtotal = '0';
        foreach ($data['items'] as $item) {
            $subtotal = Num::add($subtotal, Num::mul($item['qty'], $item['price']));
        }

        $discount = Num::money($data['discount'] ?? 0);
        $tax = Num::money($data['tax'] ?? 0);
        $total = Num::money(Num::add(Num::sub($subtotal, $discount), $tax));
        $paid = Num::money($data['paid'] ?? 0);
        $due = Num::money(Num::sub($total, $paid));

        $row = [
            'supplier_id' => $data['supplierId'] ?? null,
            'category_id' => $data['categoryId'] ?? null,
            // Purchases always belong to the factory store.
            'showroom_id' => null,
            'purchase_date' => $data['purchaseDate'],
            'subtotal' => Num::money($subtotal),
            'discount' => $discount,
            'tax' => $tax,
            'total' => $total,
            'paid' => $paid,
            'due' => $due,
            'status' => Num::cmp($due, 0) <= 0 ? 'paid' : (Num::cmp($paid, 0) > 0 ? 'partial' : 'due'),
            'payment' => $data['payment'] ?? 'cash',
            'updated_at' => now(),
        ];

        if ($insert) {
            DB::table('purchases')->insert($row + [
                'id' => $id,
                'code' => 'PO-'.strtoupper(Str::substr($id, 0, 8)),
                'created_by' => $createdBy,
                'created_at' => now(),
            ]);
        } else {
            DB::table('purchases')->where('id', $id)->update($row);
            DB::table('purchase_items')->where('purchase_id', $id)->delete();
        }
    }

    private function applyItems(string $purchaseId, array $items, $user): void
    {
        foreach ($items as $item) {
            $materialId = $item['materialId'] ?? null;
            $productId = $item['productId'] ?? null;
            if (($materialId === null) === ($productId === null)) {
                throw new BusinessRuleException('Each line needs either a raw material or a product');
            }

            $name = $materialId !== null
                ? DB::table('raw_materials')->where('id', $materialId)->value('name')
                : DB::table('products')->where('id', $productId)->value('name');
            $unit = $materialId !== null
                ? DB::table('raw_materials')->where('id', $materialId)->value('unit')
                : DB::table('products')->where('id', $productId)->value('unit');

            DB::table('purchase_items')->insert([
                'id' => (string) Str::uuid(),
                'purchase_id' => $purchaseId,
                'material_id' => $materialId,
                'product_id' => $productId,
                'name' => $name,
                'unit' => $unit,
                'qty' => Num::qty($item['qty']),
                'price' => Num::money($item['price']),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if ($materialId !== null) {
                $this->stock->rawMovement($user, $materialId, null,
                    Num::abs($item['qty']), 'purchase_in', 'purchase', $purchaseId, null);
            } else {
                $this->stock->productMovement($user, $productId, null,
                    Num::abs($item['qty']), 'purchase_in', 'purchase', $purchaseId, null);
            }
        }
    }

    /** Undo every intake this purchase created, so an edit cannot go negative. */
    private function reverseItems(string $purchaseId, $user): void
    {
        $items = DB::table('purchase_items')->where('purchase_id', $purchaseId)->get();

        foreach ($items as $item) {
            if ($item->material_id !== null) {
                $this->stock->rawMovement($user, $item->material_id, null,
                    Num::neg(Num::abs($item->qty)), 'purchase_reverse', 'purchase', $purchaseId,
                    'Purchase edited — previous intake reversed');
            } elseif ($item->product_id !== null) {
                $this->stock->productMovement($user, $item->product_id, null,
                    Num::neg(Num::abs($item->qty)), 'purchase_reverse', 'purchase', $purchaseId,
                    'Purchase edited — previous intake reversed');
            }
        }
    }
}
