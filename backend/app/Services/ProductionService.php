<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Production batches. Ports commit_production_batch (sql/25),
 * reverse_production_batch_internal / void_production_batch (sql/32) and
 * edit_production_batch (sql/34, keeps the original production date).
 *
 * A batch is identified by one generated UUID ($batchId) that is written to
 *   stock_ledger.ref_id          (kind production / production_void)
 *   raw_stock_ledger.ref_id      (kind production_consume / production_reverse)
 *   production_overheads.batch_id
 * with ref_type = 'production'.
 *
 * Ingredient input (same shape the React app already sends):
 *   [['materialId' => uuid, 'qty' => per-unit], ['subRecipeId' => uuid, 'qty' => per-unit], ...]
 * Overhead input: [['categoryId' => uuid, 'amount' => n, 'note' => ?], ...]
 */
class ProductionService
{
    public function __construct(
        private readonly AccessService $access,
        private readonly StockService $stock,
    ) {}

    /**
     * Expand materials + sub-recipes into total quantity per raw material for
     * the whole batch. Sub-recipe: (qty_per_unit * batch / yield_qty) * item.qty.
     *
     * @return array<string,string> material_id => total qty
     */
    public function expandIngredients(array $ingredients, mixed $batch): array
    {
        if ($ingredients === []) {
            throw new BusinessRuleException('At least one ingredient is required');
        }

        $totals = [];
        foreach ($ingredients as $ing) {
            $materialId = ($ing['materialId'] ?? '') !== '' ? (string) $ing['materialId'] : null;
            $subId = ($ing['subRecipeId'] ?? '') !== '' ? (string) $ing['subRecipeId'] : null;
            $perUnit = Num::of($ing['qty'] ?? 0);

            if (Num::cmp($perUnit, 0) <= 0) {
                throw new BusinessRuleException('Ingredient quantity must be greater than zero');
            }
            if ($materialId !== null && $subId !== null) {
                throw new BusinessRuleException('Ingredient can only reference either material or sub-recipe');
            }

            if ($materialId !== null) {
                $totals[$materialId] = Num::add($totals[$materialId] ?? 0, Num::mul($perUnit, $batch));
            } elseif ($subId !== null) {
                $yield = DB::table('sub_recipes')->where('id', $subId)->where('is_active', true)->value('yield_qty');
                if ($yield === null) {
                    throw new BusinessRuleException('Sub-recipe not found or inactive');
                }
                if (Num::cmp($yield, 0) <= 0) {
                    throw new BusinessRuleException('Sub-recipe yield must be greater than zero');
                }
                $ratio = Num::div(Num::mul($perUnit, $batch), $yield);
                $items = DB::table('sub_recipe_items')->where('sub_recipe_id', $subId)->get(['material_id', 'qty']);
                foreach ($items as $it) {
                    $totals[$it->material_id] = Num::add($totals[$it->material_id] ?? 0, Num::mul($it->qty, $ratio));
                }
            } else {
                throw new BusinessRuleException('Ingredient needs either material or sub-recipe');
            }
        }

        return $totals;
    }

    /** Create a batch. Returns the new batch id. */
    public function commitBatch(?User $actor, string $productId, ?string $showroomId, mixed $batch,
        array $ingredients, array $overheads = []): string
    {
        return DB::transaction(function () use ($actor, $productId, $showroomId, $batch, $ingredients, $overheads) {
            $system = $actor === null;
            $this->access->assertAppStaff($actor, $system);
            $this->access->assertLocation($actor, $showroomId, $system);

            if ($productId === '') {
                throw new BusinessRuleException('Product is required');
            }
            $this->assertBatchQty($batch);

            $totals = $this->expandIngredients($ingredients, $batch);
            $this->assertEnoughRaw($totals, $showroomId, 'Insufficient raw materials for this batch');

            $batchId = (string) Str::uuid();
            $this->apply($batchId, $productId, $showroomId, $batch, $totals, $overheads, null);

            // Stamp mfg / expiry on the product (current_date + shelf life).
            $shelf = (int) (DB::table('products')->where('id', $productId)->value('shelf_life_days') ?? 0);
            $today = now()->toDateString();
            $update = ['mfg_date' => $today, 'updated_at' => now()];
            if ($shelf > 0) {
                $update['expiry_date'] = now()->addDays($shelf)->toDateString();
            }
            DB::table('products')->where('id', $productId)->update($update);

            return $batchId;
        });
    }

    /** Delete (void) a batch — needs production.batches.delete. */
    public function voidBatch(?User $actor, string $batchId, ?string $note = null): void
    {
        DB::transaction(function () use ($actor, $batchId, $note) {
            $system = $actor === null;
            $this->access->assertAppStaff($actor, $system);
            $this->access->assertPermission($actor, 'production.batches.delete', $system);
            $this->reverse($actor, $batchId, $note ?? 'Batch deleted');
        });
    }

    /**
     * Edit a batch — reverse then re-apply under the SAME batch id, and pin
     * every row back to the original production timestamp (sql/34).
     */
    public function editBatch(?User $actor, string $batchId, mixed $batch, array $ingredients, array $overheads = []): string
    {
        return DB::transaction(function () use ($actor, $batchId, $batch, $ingredients, $overheads) {
            $system = $actor === null;
            $this->access->assertAppStaff($actor, $system);
            $this->access->assertPermission($actor, 'production.batches.edit', $system);

            $orig = DB::table('stock_ledger')
                ->where('ref_id', $batchId)->where('ref_type', 'production')->where('kind', 'production')
                ->orderBy('created_at')->first(['product_id', 'showroom_id', 'created_at']);
            if (! $orig) {
                throw new BusinessRuleException("Batch {$batchId} not found");
            }
            $this->access->assertLocation($actor, $orig->showroom_id, $system);

            $this->assertBatchQty($batch);
            if ($ingredients === []) {
                throw new BusinessRuleException('At least one ingredient is required');
            }

            // Reverse first so the availability check sees restored balances.
            $this->reverse($actor, $batchId, 'Batch edited — previous entry reversed');

            $totals = $this->expandIngredients($ingredients, $batch);
            $this->assertEnoughRaw($totals, $orig->showroom_id, 'Insufficient raw materials for the corrected batch');

            $this->apply($batchId, $orig->product_id, $orig->showroom_id, $batch, $totals, $overheads, 'Batch edited');

            // A correction never moves the transaction date.
            $at = $orig->created_at;
            DB::table('stock_ledger')->where('ref_id', $batchId)->where('ref_type', 'production')
                ->where('created_at', '<>', $at)->update(['created_at' => $at]);
            DB::table('raw_stock_ledger')->where('ref_id', $batchId)->where('ref_type', 'production')
                ->where('created_at', '<>', $at)->update(['created_at' => $at]);
            DB::table('production_overheads')->where('batch_id', $batchId)
                ->where('created_at', '<>', $at)->update(['created_at' => $at]);

            return $batchId;
        });
    }

    // -------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------

    /** reverse_production_batch_internal — caller asserts permission first. */
    private function reverse(?User $actor, string $batchId, string $note): void
    {
        $prod = DB::table('stock_ledger')
            ->where('ref_id', $batchId)->where('ref_type', 'production')
            ->whereIn('kind', ['production', 'production_void'])
            ->groupBy('product_id', 'showroom_id')
            ->selectRaw('product_id, showroom_id, SUM(qty) AS qty')
            ->first();

        if (! $prod || $prod->product_id === null) {
            throw new BusinessRuleException("Batch {$batchId} not found");
        }
        // Already reversed? Never deduct a second time.
        if (Num::cmp($prod->qty ?? 0, 0) <= 0) {
            throw new BusinessRuleException('This batch has already been deleted/reversed');
        }

        $this->access->assertLocation($actor, $prod->showroom_id, $actor === null);

        $available = $this->stock->lockedBalance('product_stock', 'product_id', $prod->product_id, $prod->showroom_id);
        if (Num::cmp($available, $prod->qty) < 0) {
            throw new BusinessRuleException(sprintf(
                'Cannot reverse this batch: only %s of %s produced units are still in stock (the rest was sold, transferred or wasted)',
                $this->fmt($available), $this->fmt($prod->qty)));
        }

        // Put raw materials back (net of any earlier reversal).
        $consumed = DB::table('raw_stock_ledger')
            ->where('ref_id', $batchId)->where('ref_type', 'production')
            ->whereIn('kind', ['production_consume', 'production_reverse'])
            ->groupBy('material_id')
            ->havingRaw('SUM(qty) <> 0')
            ->selectRaw('material_id, SUM(qty) AS qty')
            ->get();
        foreach ($consumed as $row) {
            $this->stock->move('raw_stock_ledger', 'raw_material_stock', 'material_id', $row->material_id,
                $prod->showroom_id, Num::neg($row->qty), 'production_reverse', 'production', $batchId, $note);
        }

        $this->stock->move('stock_ledger', 'product_stock', 'product_id', $prod->product_id,
            $prod->showroom_id, Num::neg($prod->qty), 'production_void', 'production', $batchId, $note);

        DB::table('production_overheads')->where('batch_id', $batchId)->delete();
    }

    /** Consume raw materials, add finished stock, store overheads. */
    private function apply(string $batchId, string $productId, ?string $showroomId, mixed $batch,
        array $totals, array $overheads, ?string $note): void
    {
        foreach ($totals as $materialId => $required) {
            $this->stock->move('raw_stock_ledger', 'raw_material_stock', 'material_id', (string) $materialId,
                $showroomId, Num::neg($required), 'production_consume', 'production', $batchId, $note);
        }

        $this->stock->move('stock_ledger', 'product_stock', 'product_id', $productId,
            $showroomId, $batch, 'production', 'production', $batchId, $note);

        foreach ($overheads as $oh) {
            $cat = $oh['categoryId'] ?? '';
            $amount = Num::of($oh['amount'] ?? 0);
            if ($cat !== '' && $cat !== null && Num::cmp($amount, 0) > 0) {
                DB::table('production_overheads')->insert([
                    'id' => (string) Str::uuid(),
                    'batch_id' => $batchId,
                    'product_id' => $productId,
                    'category_id' => $cat,
                    'amount' => Num::money($amount),
                    'note' => ($oh['note'] ?? '') !== '' ? $oh['note'] : null,
                    'created_at' => now(),
                ]);
            }
        }
    }

    private function assertEnoughRaw(array $totals, ?string $showroomId, string $message): void
    {
        foreach ($totals as $materialId => $required) {
            $have = $this->stock->lockedBalance('raw_material_stock', 'material_id', (string) $materialId, $showroomId);
            if (Num::cmp($have, $required) < 0) {
                throw new BusinessRuleException($message);
            }
        }
    }

    private function assertBatchQty(mixed $batch): void
    {
        if ($batch === null || $batch === '' || Num::cmp($batch, 0) <= 0) {
            throw new BusinessRuleException('Batch quantity must be greater than zero');
        }
    }

    private function fmt(mixed $n): string
    {
        $s = Num::qty($n);

        return str_contains($s, '.') ? rtrim(rtrim($s, '0'), '.') : $s;
    }
}
