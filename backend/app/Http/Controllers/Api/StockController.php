<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Finished-product and raw-material stock, their ledgers, damaged stock,
 * damaged sale and finished-product wastage.
 */
class StockController extends Controller
{
    public function __construct(private readonly StockService $stock) {}

    /** Finished product stock for the current location. */
    public function products(Request $request): JsonResponse
    {
        $showroomId = $this->location($request);
        [$limit, $offset] = $this->paginationParams($request);

        $q = DB::table('product_stock as s')
            ->join('products as p', 'p.id', '=', 's.product_id')
            ->where('p.is_active', true);

        $q = $showroomId === null ? $q->whereNull('s.showroom_id') : $q->where('s.showroom_id', $showroomId);

        if ($search = $request->query('q')) {
            $like = '%'.$search.'%';
            $q->where(fn ($w) => $w->where('p.name', 'like', $like)->orWhere('p.sku', 'like', $like));
        }
        if ($request->boolean('low_only')) {
            $q->whereColumn('s.quantity', '<=', 's.min_stock');
        }

        $total = (clone $q)->count();

        $rows = $q->orderBy('p.name')->limit($limit)->offset($offset)->get([
            's.product_id', 'p.name', 'p.sku', 'p.unit', 'p.cost', 'p.price',
            's.quantity', 's.min_stock',
        ]);

        return response()->json(['total' => $total, 'limit' => $limit, 'offset' => $offset, 'rows' => $rows]);
    }

    /** Raw material stock — factory only in practice (showroom_id NULL). */
    public function materials(Request $request): JsonResponse
    {
        $showroomId = $this->location($request);
        [$limit, $offset] = $this->paginationParams($request);

        $q = DB::table('raw_material_stock as s')
            ->join('raw_materials as m', 'm.id', '=', 's.material_id')
            ->where('m.is_active', true);

        $q = $showroomId === null ? $q->whereNull('s.showroom_id') : $q->where('s.showroom_id', $showroomId);

        if ($search = $request->query('q')) {
            $q->where('m.name', 'like', '%'.$search.'%');
        }
        if ($request->boolean('low_only')) {
            $q->whereColumn('s.quantity', '<=', 's.min_stock');
        }

        $total = (clone $q)->count();

        $rows = $q->orderBy('m.name')->limit($limit)->offset($offset)->get([
            's.material_id', 'm.name', 'm.unit', 'm.cost', 's.quantity', 's.min_stock',
        ]);

        return response()->json(['total' => $total, 'limit' => $limit, 'offset' => $offset, 'rows' => $rows]);
    }

    /** Damaged stock on hand at the current location. */
    public function damaged(Request $request): JsonResponse
    {
        $showroomId = $this->location($request);
        $q = DB::table('damaged_stock as s')
            ->join('products as p', 'p.id', '=', 's.product_id')
            ->where('s.quantity', '>', 0);
        $q = $showroomId === null ? $q->whereNull('s.showroom_id') : $q->where('s.showroom_id', $showroomId);

        return response()->json(['rows' => $q->orderBy('p.name')->get(['s.product_id', 'p.name', 'p.sku', 'p.unit', 's.quantity'])]);
    }

    /** Movement history. type=product|material|damaged */
    public function ledger(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:product,material,damaged'],
            'id' => ['nullable', 'uuid'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        [$limit, $offset] = $this->paginationParams($request);
        $showroomId = $this->location($request);

        [$table, $keyCol, $nameTable, $nameKey] = match ($data['type']) {
            'product' => ['stock_ledger', 'product_id', 'products', 'id'],
            'material' => ['raw_stock_ledger', 'material_id', 'raw_materials', 'id'],
            'damaged' => ['damaged_ledger', 'product_id', 'products', 'id'],
        };

        $q = DB::table($table.' as l')
            ->leftJoin($nameTable.' as n', 'n.'.$nameKey, '=', 'l.'.$keyCol);

        $q = $showroomId === null ? $q->whereNull('l.showroom_id') : $q->where('l.showroom_id', $showroomId);

        if (! empty($data['id'])) {
            $q->where('l.'.$keyCol, $data['id']);
        }
        if (! empty($data['from'])) {
            $q->where('l.created_at', '>=', $data['from']);
        }
        if (! empty($data['to'])) {
            $q->where('l.created_at', '<=', $data['to']);
        }

        $total = (clone $q)->count();

        $rows = $q->orderByDesc('l.created_at')->limit($limit)->offset($offset)->get([
            'l.id', 'l.'.$keyCol.' as item_id', 'n.name as item_name', 'n.unit',
            'l.qty', 'l.kind', 'l.ref_type', 'l.ref_id', 'l.note', 'l.created_at',
        ]);

        return response()->json(['total' => $total, 'limit' => $limit, 'offset' => $offset, 'rows' => $rows]);
    }

    /** Manual adjustment (stock take correction). Signed qty. */
    public function adjust(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:product,material'],
            'id' => ['required', 'uuid'],
            'qty' => ['required', 'numeric'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $showroomId = $this->location($request);
        $kind = $data['qty'] >= 0 ? 'adjust_in' : 'adjust_out';

        $id = $data['type'] === 'product'
            ? $this->stock->productMovement($request->user(), $data['id'], $showroomId, $data['qty'], $kind, 'adjustment', null, $data['note'] ?? null)
            : $this->stock->rawMovement($request->user(), $data['id'], $showroomId, $data['qty'], $kind, 'adjustment', null, $data['note'] ?? null);

        return response()->json(['ledgerId' => $id], 201);
    }

    /** Sell damaged stock at a reduced price. */
    public function damagedSale(Request $request): JsonResponse
    {
        $data = $request->validate([
            'productId' => ['required', 'uuid'],
            'qty' => ['required', 'numeric', 'gt:0'],
            'unitPrice' => ['required', 'numeric', 'min:0'],
            'customerName' => ['nullable', 'string', 'max:160'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $id = $this->stock->damagedSale(
            $request->user(), $data['productId'], $this->location($request),
            $data['qty'], $data['unitPrice'], $data['customerName'] ?? null, $data['note'] ?? null,
        );

        return response()->json(['id' => $id], 201);
    }

    /** Finished product wasted → damaged stock → repurpose queue. */
    public function wastage(Request $request): JsonResponse
    {
        $data = $request->validate([
            'productId' => ['required', 'uuid'],
            'qty' => ['required', 'numeric', 'gt:0'],
            'reason' => ['nullable', 'string', 'max:200'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $queueId = $this->stock->finishedWastage(
            $request->user(), $data['productId'], $this->location($request),
            $data['qty'], $data['reason'] ?? null, $data['note'] ?? null,
        );

        return response()->json(['queueId' => $queueId], 201);
    }
}
