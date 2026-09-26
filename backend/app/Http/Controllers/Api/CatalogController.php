<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\RawMaterial;
use App\Models\Recipe;
use App\Models\RecipeCategory;
use App\Models\SubRecipe;
use App\Models\SubRecipeItem;
use App\Models\Supplier;
use App\Models\Unit;
use App\Services\BusinessRuleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Master data: products, raw materials, recipes, sub-recipes, units,
 * categories, customers and suppliers.
 */
class CatalogController extends Controller
{
    public function products(Request $request): JsonResponse
    {
        [$limit, $offset] = $this->paginationParams($request);

        $q = Product::query()->with('category');
        if (! $request->boolean('include_inactive')) {
            $q->where('is_active', true);
        }
        if ($search = $request->query('q')) {
            $like = '%'.$search.'%';
            $q->where(fn ($w) => $w->where('name', 'like', $like)
                ->orWhere('sku', 'like', $like)
                ->orWhere('barcode', 'like', $like));
        }
        if ($category = $request->query('category')) {
            $q->where('category_id', $category);
        }

        $total = $q->count();
        $rows = $q->orderBy('name')->limit($limit)->offset($offset)->get();

        return response()->json(['total' => $total, 'limit' => $limit, 'offset' => $offset, 'rows' => $rows]);
    }

    public function storeProduct(Request $request): JsonResponse
    {
        $data = $this->productRules($request);
        $this->assertSkuFree($data['sku'] ?? null, null);

        $product = Product::create($data);

        return response()->json($product, 201);
    }

    public function updateProduct(Request $request, string $id): JsonResponse
    {
        $product = Product::findOrFail($id);
        $data = $this->productRules($request);
        $this->assertSkuFree($data['sku'] ?? null, $id);

        $product->update($data);

        return response()->json($product);
    }

    public function destroyProduct(Request $request, string $id): JsonResponse
    {
        $product = Product::findOrFail($id);
        // Never hard-delete something a sale or ledger row points at.
        $product->update(['is_active' => false]);

        return response()->json(['ok' => true]);
    }

    public function materials(Request $request): JsonResponse
    {
        $q = RawMaterial::query();
        if (! $request->boolean('include_inactive')) {
            $q->where('is_active', true);
        }
        if ($search = $request->query('q')) {
            $q->where('name', 'like', '%'.$search.'%');
        }

        return response()->json(['rows' => $q->orderBy('name')->get()]);
    }

    public function storeMaterial(Request $request): JsonResponse
    {
        return response()->json(RawMaterial::create($this->materialRules($request)), 201);
    }

    public function updateMaterial(Request $request, string $id): JsonResponse
    {
        $material = RawMaterial::findOrFail($id);
        $material->update($this->materialRules($request));

        return response()->json($material);
    }

    /** Recipe (bill of materials) for one product, materials and sub-recipes together. */
    public function recipe(Request $request, string $productId): JsonResponse
    {
        $rows = DB::table('recipes as r')
            ->leftJoin('raw_materials as m', 'm.id', '=', 'r.material_id')
            ->leftJoin('sub_recipes as sr', 'sr.id', '=', 'r.sub_recipe_id')
            ->leftJoin('recipe_categories as c', 'c.id', '=', 'r.category_id')
            ->where('r.product_id', $productId)
            ->get([
                'r.id', 'r.material_id', 'r.sub_recipe_id', 'r.category_id', 'r.qty',
                'm.name as material_name', 'm.unit as material_unit', 'm.cost as material_cost',
                'sr.name as sub_recipe_name', 'sr.yield_qty', 'sr.yield_unit',
                'c.name as category_name',
            ]);

        return response()->json(['productId' => $productId, 'rows' => $rows]);
    }

    public function saveRecipe(Request $request, string $productId): JsonResponse
    {
        $data = $request->validate([
            'rows' => ['present', 'array'],
            'rows.*.materialId' => ['nullable', 'uuid'],
            'rows.*.subRecipeId' => ['nullable', 'uuid'],
            'rows.*.categoryId' => ['nullable', 'uuid'],
            'rows.*.qty' => ['required', 'numeric', 'gt:0'],
        ]);

        return DB::transaction(function () use ($data, $productId) {
            Recipe::where('product_id', $productId)->delete();

            foreach ($data['rows'] as $row) {
                $materialId = $row['materialId'] ?? null;
                $subId = $row['subRecipeId'] ?? null;
                if (($materialId === null) === ($subId === null)) {
                    throw new BusinessRuleException('Each recipe line needs either a material or a sub-recipe');
                }

                Recipe::create([
                    'product_id' => $productId,
                    'material_id' => $materialId,
                    'sub_recipe_id' => $subId,
                    'category_id' => $row['categoryId'] ?? null,
                    'qty' => $row['qty'],
                ]);
            }

            return response()->json(['ok' => true]);
        });
    }

    public function subRecipes(Request $request): JsonResponse
    {
        $rows = SubRecipe::with(['items.material'])
            ->when(! $request->boolean('include_inactive'), fn ($q) => $q->where('is_active', true))
            ->orderBy('name')->get();

        return response()->json(['rows' => $rows]);
    }

    public function saveSubRecipe(Request $request, ?string $id = null): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'yield_qty' => ['required', 'numeric', 'gt:0'],
            'yield_unit' => ['required', 'string', 'max:40'],
            'is_active' => ['nullable', 'boolean'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.materialId' => ['required', 'uuid'],
            'items.*.qty' => ['required', 'numeric', 'gt:0'],
        ]);

        return DB::transaction(function () use ($data, $id) {
            $sub = $id !== null ? SubRecipe::findOrFail($id) : new SubRecipe;
            $sub->fill([
                'name' => $data['name'],
                'yield_qty' => $data['yield_qty'],
                'yield_unit' => $data['yield_unit'],
                'is_active' => $data['is_active'] ?? true,
            ])->save();

            SubRecipeItem::where('sub_recipe_id', $sub->id)->delete();
            foreach ($data['items'] as $item) {
                SubRecipeItem::create([
                    'sub_recipe_id' => $sub->id,
                    'material_id' => $item['materialId'],
                    'qty' => $item['qty'],
                ]);
            }

            return response()->json($sub->load('items'), $id === null ? 201 : 200);
        });
    }

    public function lookups(Request $request): JsonResponse
    {
        return response()->json([
            'units' => Unit::where('is_active', true)->orderBy('name')->get(['id', 'name', 'code', 'short_name']),
            'productCategories' => ProductCategory::orderBy('name')->get(['id', 'name']),
            'recipeCategories' => RecipeCategory::where('is_active', true)->orderBy('name')->get(['id', 'name', 'color']),
            'purchaseCategories' => DB::table('purchase_categories')->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'expenseCategories' => DB::table('expense_categories')->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'overheadCategories' => DB::table('production_overhead_categories')->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'sellingPriceGroups' => DB::table('selling_price_groups')->where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'showrooms' => DB::table('showrooms')->where('is_active', true)->orderBy('name')->get(['id', 'name', 'code', 'is_factory']),
            'company' => DB::table('company_settings')->where('is_current', true)->first(),
        ]);
    }

    public function customers(Request $request): JsonResponse
    {
        [$limit, $offset] = $this->paginationParams($request);

        $q = Customer::query()->where('is_active', true);
        if ($search = $request->query('q')) {
            $like = '%'.$search.'%';
            $q->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('phone', 'like', $like));
        }

        return response()->json([
            'total' => $q->count(),
            'rows' => $q->orderBy('name')->limit($limit)->offset($offset)->get(),
        ]);
    }

    public function suppliers(Request $request): JsonResponse
    {
        $q = Supplier::query()->where('is_active', true);
        if ($search = $request->query('q')) {
            $q->where('name', 'like', '%'.$search.'%');
        }

        return response()->json(['rows' => $q->orderBy('name')->get()]);
    }

    // -------------------------------------------------------------------

    private function productRules(Request $request): array
    {
        return $request->validate([
            'sku' => ['nullable', 'string', 'max:60'],
            'name' => ['required', 'string', 'max:200'],
            'category_id' => ['nullable', 'uuid'],
            'unit' => ['nullable', 'string', 'max:40'],
            'price' => ['required', 'numeric', 'min:0'],
            'cost' => ['nullable', 'numeric', 'min:0'],
            'transfer_price' => ['nullable', 'numeric', 'min:0'],
            'threshold' => ['nullable', 'numeric', 'min:0'],
            'shelf_life_days' => ['nullable', 'integer', 'min:0'],
            'barcode' => ['nullable', 'string', 'max:80'],
            'image_url' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string'],
            'is_active' => ['nullable', 'boolean'],
            'show_on_landing' => ['nullable', 'boolean'],
        ]);
    }

    private function materialRules(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:200'],
            'unit' => ['nullable', 'string', 'max:40'],
            'cost' => ['required', 'numeric', 'min:0'],
            'min_stock' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);
    }

    /** Same duplicate guard the React product form uses. */
    private function assertSkuFree(?string $sku, ?string $ignoreId): void
    {
        if ($sku === null || $sku === '') {
            return;
        }

        $exists = Product::where('sku', $sku)
            ->when($ignoreId !== null, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new BusinessRuleException("SKU {$sku} is already used by another product");
        }
    }
}
