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
 * Factory → showroom transfers (and damaged returns coming back).
 * Stock only moves in StockService, inside one transaction, all-or-nothing.
 */
class TransferController extends Controller
{
    public function __construct(private readonly StockService $stock) {}

    public function index(Request $request): JsonResponse
    {
        [$limit, $offset] = $this->paginationParams($request);
        $showroomId = $this->location($request);

        $q = DB::table('transfers as t')
            ->leftJoin('showrooms as src', 'src.id', '=', 't.source_showroom_id')
            ->leftJoin('showrooms as dst', 'dst.id', '=', 't.dest_showroom_id');

        // A location sees transfers it sent or is receiving; factory rows have NULL.
        if ($showroomId === null) {
            $q->where(fn ($w) => $w->whereNull('t.source_showroom_id')->orWhereNull('t.dest_showroom_id'));
        } else {
            $q->where(fn ($w) => $w->where('t.source_showroom_id', $showroomId)->orWhere('t.dest_showroom_id', $showroomId));
        }

        if ($status = $request->query('status')) {
            $q->where('t.status', $status);
        }
        if ($kind = $request->query('kind')) {
            $q->where('t.kind', $kind);
        }
        if ($from = $request->query('from')) {
            $q->where('t.created_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('t.created_at', '<=', $to);
        }

        $total = (clone $q)->count();

        $rows = $q->orderByDesc('t.created_at')->limit($limit)->offset($offset)->get([
            't.id', 't.code', 't.status', 't.kind', 't.note', 't.created_at', 't.sent_at', 't.received_at',
            't.source_showroom_id', 't.dest_showroom_id',
            'src.name as source_name', 'dst.name as dest_name',
        ]);

        return response()->json(['total' => $total, 'limit' => $limit, 'offset' => $offset, 'rows' => $rows]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $transfer = DB::table('transfers')->where('id', $id)->first();
        if (! $transfer) {
            throw new BusinessRuleException("Transfer {$id} not found");
        }

        $items = DB::table('transfer_items as ti')
            ->leftJoin('products as p', 'p.id', '=', 'ti.product_id')
            ->leftJoin('raw_materials as m', 'm.id', '=', 'ti.material_id')
            ->where('ti.transfer_id', $id)
            ->get([
                'ti.id', 'ti.product_id', 'ti.material_id', 'ti.qty', 'ti.unit_price',
                'p.name as product_name', 'p.sku', 'p.unit as product_unit',
                'm.name as material_name', 'm.unit as material_unit',
            ]);

        return response()->json(['transfer' => $transfer, 'items' => $items]);
    }

    /** Draft a transfer. Nothing moves until send(). */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'destShowroomId' => ['nullable', 'uuid'],
            'kind' => ['nullable', 'string', 'max:40'],
            'note' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.productId' => ['nullable', 'uuid'],
            'items.*.materialId' => ['nullable', 'uuid'],
            'items.*.qty' => ['required', 'numeric', 'gt:0'],
            'items.*.unitPrice' => ['nullable', 'numeric', 'min:0'],
        ]);

        $sourceId = $this->location($request);

        return DB::transaction(function () use ($data, $request, $sourceId) {
            $id = (string) Str::uuid();

            DB::table('transfers')->insert([
                'id' => $id,
                'code' => 'TR-'.strtoupper(Str::substr($id, 0, 8)),
                'source_showroom_id' => $sourceId,
                'dest_showroom_id' => $data['destShowroomId'] ?? null,
                'status' => 'draft',
                'kind' => $data['kind'] ?? 'stock',
                'note' => $data['note'] ?? null,
                'created_by' => $request->user()?->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach ($data['items'] as $item) {
                $productId = $item['productId'] ?? null;
                $materialId = $item['materialId'] ?? null;

                if (($productId === null) === ($materialId === null)) {
                    throw new BusinessRuleException('Each line needs either a product or a raw material');
                }

                // Supply price rule from sql/35: transfer_price, else cost, else 0.
                $price = $item['unitPrice'] ?? ($productId !== null
                    ? $this->stock->defaultTransferPrice($productId)
                    : (DB::table('raw_materials')->where('id', $materialId)->value('cost') ?? 0));

                DB::table('transfer_items')->insert([
                    'id' => (string) Str::uuid(),
                    'transfer_id' => $id,
                    'product_id' => $productId,
                    'material_id' => $materialId,
                    'qty' => Num::qty($item['qty']),
                    'unit_price' => Num::money($price),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return response()->json(['id' => $id], 201);
        });
    }

    public function send(Request $request, string $id): JsonResponse
    {
        $this->stock->sendTransfer($request->user(), $id);

        return response()->json(['ok' => true]);
    }

    public function receive(Request $request, string $id): JsonResponse
    {
        $this->stock->receiveTransfer($request->user(), $id);

        return response()->json(['ok' => true]);
    }

    /** Factory approves a damaged return coming back from a showroom. */
    public function approveDamaged(Request $request, string $id): JsonResponse
    {
        $this->stock->approveDamagedReturn($request->user(), $id);

        return response()->json(['ok' => true]);
    }

    /** Cancel a transfer that has not left the source yet (no stock has moved). */
    public function cancel(Request $request, string $id): JsonResponse
    {
        return DB::transaction(function () use ($id) {
            $status = DB::table('transfers')->where('id', $id)->lockForUpdate()->value('status');
            if ($status === null) {
                throw new BusinessRuleException("Transfer {$id} not found");
            }
            if ($status !== 'draft') {
                throw new BusinessRuleException('Only a draft transfer can be cancelled');
            }
            DB::table('transfers')->where('id', $id)->update(['status' => 'cancelled', 'updated_at' => now()]);

            return response()->json(['ok' => true]);
        });
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        return DB::transaction(function () use ($id) {
            $status = DB::table('transfers')->where('id', $id)->value('status');
            if ($status === null) {
                throw new BusinessRuleException("Transfer {$id} not found");
            }
            if ($status !== 'draft') {
                throw new BusinessRuleException('Only a draft transfer can be deleted');
            }

            DB::table('transfer_items')->where('transfer_id', $id)->delete();
            DB::table('transfers')->where('id', $id)->delete();

            return response()->json(['ok' => true]);
        });
    }
}
