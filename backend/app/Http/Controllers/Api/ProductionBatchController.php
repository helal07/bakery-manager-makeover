<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ProductionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Production batches. The index() query is the Laravel replacement for
 * batch_history_page() in sql/38 + sql/39: the permission check happens once,
 * then one aggregate query per page — never one query per ingredient row.
 */
class ProductionBatchController extends Controller
{
    public function __construct(private readonly ProductionService $production) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'product' => ['nullable', 'uuid'],
            'q' => ['nullable', 'string', 'max:120'],
        ]);

        [$limit, $offset] = $this->paginationParams($request);
        $showroomId = $this->location($request);

        // Base: one row per batch (the produced stock_ledger row).
        $base = DB::table('stock_ledger as sl')
            ->join('products as p', 'p.id', '=', 'sl.product_id')
            ->where('sl.kind', 'production')
            ->where('sl.ref_type', 'production');

        $base = $showroomId === null
            ? $base->whereNull('sl.showroom_id')
            : $base->where('sl.showroom_id', $showroomId);

        if (! empty($data['from'])) {
            $base->where('sl.created_at', '>=', $data['from']);
        }
        if (! empty($data['to'])) {
            $base->where('sl.created_at', '<=', $data['to']);
        }
        if (! empty($data['product'])) {
            $base->where('sl.product_id', $data['product']);
        }
        if (! empty($data['q'])) {
            $like = '%'.$data['q'].'%';
            $base->where(function ($w) use ($like) {
                $w->where('p.name', 'like', $like)->orWhere('p.sku', 'like', $like);
            });
        }

        $total = (clone $base)->count();

        $rows = (clone $base)
            ->orderByDesc('sl.created_at')
            ->limit($limit)->offset($offset)
            ->get([
                'sl.ref_id as batch_id',
                'sl.product_id',
                'sl.qty as produced_qty',
                'sl.created_at',
                'sl.note',
                'p.name as product_name',
                'p.sku as product_sku',
                'p.unit as product_unit',
            ]);

        $batchIds = $rows->pluck('batch_id')->all();

        // Ingredients for the whole page in one query (index: ref_id, kind).
        $materials = [];
        $materialCost = [];
        if ($batchIds !== []) {
            $consumed = DB::table('raw_stock_ledger as rl')
                ->join('raw_materials as m', 'm.id', '=', 'rl.material_id')
                ->whereIn('rl.ref_id', $batchIds)
                ->where('rl.ref_type', 'production')
                ->groupBy('rl.ref_id', 'rl.material_id', 'm.name', 'm.unit', 'm.cost')
                ->get([
                    'rl.ref_id',
                    'rl.material_id',
                    'm.name',
                    'm.unit',
                    'm.cost',
                    DB::raw('SUM(ABS(rl.qty)) as qty'),
                ]);

            foreach ($consumed as $c) {
                $materials[$c->ref_id][] = [
                    'materialId' => $c->material_id,
                    'name' => $c->name,
                    'unit' => $c->unit,
                    'qty' => (float) $c->qty,
                    'cost' => round((float) $c->qty * (float) $c->cost, 2),
                ];
                $materialCost[$c->ref_id] = ($materialCost[$c->ref_id] ?? 0) + (float) $c->qty * (float) $c->cost;
            }
        }

        // Overheads for the page in one query (index: batch_id).
        $overheads = [];
        if ($batchIds !== []) {
            $oh = DB::table('production_overheads as o')
                ->leftJoin('production_overhead_categories as c', 'c.id', '=', 'o.category_id')
                ->whereIn('o.batch_id', $batchIds)
                ->get(['o.batch_id', 'o.amount', 'o.note', 'c.name as category']);

            foreach ($oh as $o) {
                $overheads[$o->batch_id][] = [
                    'category' => $o->category,
                    'amount' => (float) $o->amount,
                    'note' => $o->note,
                ];
            }
        }

        $out = $rows->map(function ($r) use ($materials, $materialCost, $overheads) {
            $mCost = round($materialCost[$r->batch_id] ?? 0, 2);
            $oCost = round(array_sum(array_column($overheads[$r->batch_id] ?? [], 'amount')), 2);

            return [
                'batchId' => $r->batch_id,
                'productId' => $r->product_id,
                'productName' => $r->product_name,
                'productSku' => $r->product_sku,
                'unit' => $r->product_unit,
                'qty' => (float) $r->produced_qty,
                'createdAt' => $r->created_at,
                'note' => $r->note,
                'materials' => $materials[$r->batch_id] ?? [],
                'overheads' => $overheads[$r->batch_id] ?? [],
                'materialCost' => $mCost,
                'overheadCost' => $oCost,
                'totalCost' => round($mCost + $oCost, 2),
            ];
        })->values();

        return response()->json([
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'totals' => [
                'batches' => $total,
                'qty' => round($out->sum('qty'), 4),
                'materialCost' => round($out->sum('materialCost'), 2),
                'overheadCost' => round($out->sum('overheadCost'), 2),
                'totalCost' => round($out->sum('totalCost'), 2),
            ],
            'rows' => $out,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->batchRules($request);

        $batchId = $this->production->commitBatch(
            $request->user(),
            $data['productId'],
            $this->location($request),
            $data['batch'],
            $data['ingredients'],
            $data['overheads'] ?? [],
        );

        return response()->json(['batchId' => $batchId], 201);
    }

    public function update(Request $request, string $batchId): JsonResponse
    {
        $data = $this->batchRules($request, product: false);

        $this->production->editBatch(
            $request->user(),
            $batchId,
            $data['batch'],
            $data['ingredients'],
            $data['overheads'] ?? [],
        );

        return response()->json(['batchId' => $batchId]);
    }

    public function destroy(Request $request, string $batchId): JsonResponse
    {
        $note = $request->input('note');
        $this->production->voidBatch($request->user(), $batchId, is_string($note) ? $note : null);

        return response()->json(['ok' => true]);
    }

    private function batchRules(Request $request, bool $product = true): array
    {
        $rules = [
            'batch' => ['required', 'numeric', 'gt:0'],
            'ingredients' => ['required', 'array', 'min:1'],
            'ingredients.*.materialId' => ['nullable', 'uuid'],
            'ingredients.*.subRecipeId' => ['nullable', 'uuid'],
            'ingredients.*.qty' => ['required', 'numeric', 'gt:0'],
            'overheads' => ['nullable', 'array'],
            'overheads.*.categoryId' => ['required', 'uuid'],
            'overheads.*.amount' => ['required', 'numeric', 'min:0'],
            'overheads.*.note' => ['nullable', 'string'],
        ];

        if ($product) {
            $rules['productId'] = ['required', 'uuid'];
        }

        return $request->validate($rules);
    }
}
