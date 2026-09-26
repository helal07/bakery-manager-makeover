<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\LedgerController;
use App\Http\Controllers\Api\ProductionBatchController;
use App\Http\Controllers\Api\PosController;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\TransferController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API routes
|--------------------------------------------------------------------------
| Every business route sits behind:
|   auth:sanctum  — a signed-in account
|   staff         — assert_app_staff()
|   location      — resolves X-Location-Id and checks access (null = factory)
|   perm:<key>    — dynamic RBAC, same keys the React app already uses
*/

Route::post('auth/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::post('auth/password', [AuthController::class, 'changePassword']);
});

Route::middleware(['auth:sanctum', 'staff', 'location'])->group(function () {

    // ---------------- master data ----------------
    Route::get('lookups', [CatalogController::class, 'lookups']);

    Route::get('products', [CatalogController::class, 'products'])->middleware('perm:products.view');
    Route::post('products', [CatalogController::class, 'storeProduct'])->middleware('perm:products.create');
    Route::put('products/{id}', [CatalogController::class, 'updateProduct'])->middleware('perm:products.edit');
    Route::delete('products/{id}', [CatalogController::class, 'destroyProduct'])->middleware('perm:products.delete');

    Route::get('materials', [CatalogController::class, 'materials'])->middleware('perm:production.raw_materials.view');
    Route::post('materials', [CatalogController::class, 'storeMaterial'])->middleware('perm:production.raw_materials.manage');
    Route::put('materials/{id}', [CatalogController::class, 'updateMaterial'])->middleware('perm:production.raw_materials.manage');

    Route::get('recipes', [CatalogController::class, 'allRecipes'])->middleware('perm:production.recipes.view');
    Route::get('recipes/{productId}', [CatalogController::class, 'recipe'])->middleware('perm:production.recipes.view');
    Route::put('recipes/{productId}', [CatalogController::class, 'saveRecipe'])->middleware('perm:production.recipes.manage');

    Route::get('sub-recipes', [CatalogController::class, 'subRecipes'])->middleware('perm:production.recipes.view');
    Route::post('sub-recipes', [CatalogController::class, 'saveSubRecipe'])->middleware('perm:production.sub_recipes.manage');
    Route::put('sub-recipes/{id}', [CatalogController::class, 'saveSubRecipe'])->middleware('perm:production.sub_recipes.manage');
    Route::delete('sub-recipes/{id}', [CatalogController::class, 'destroySubRecipe'])->middleware('perm:production.sub_recipes.manage');

    Route::get('customers', [CatalogController::class, 'customers'])->middleware('perm:contacts.customers.view');
    Route::get('suppliers', [CatalogController::class, 'suppliers'])->middleware('perm:contacts.suppliers.view');

    // ---------------- production ----------------
    Route::get('production/batches', [ProductionBatchController::class, 'index'])
        ->middleware('perm:production.reports.batch_history,production.batches');
    Route::post('production/batches', [ProductionBatchController::class, 'store'])
        ->middleware('perm:production.batches');
    Route::put('production/batches/{batchId}', [ProductionBatchController::class, 'update'])
        ->middleware('perm:production.batches.edit');
    Route::delete('production/batches/{batchId}', [ProductionBatchController::class, 'destroy'])
        ->middleware('perm:production.batches.delete');

    // ---------------- stock ----------------
    Route::get('stock/products', [StockController::class, 'products'])->middleware('perm:inventory.view');
    Route::get('stock/materials', [StockController::class, 'materials'])->middleware('perm:production.factory_stock.view,inventory.view');
    Route::get('stock/damaged', [StockController::class, 'damaged'])->middleware('perm:inventory.view,inventory.damaged_return');
    Route::get('stock/ledger', [StockController::class, 'ledger'])->middleware('perm:inventory.view');
    Route::post('stock/adjust', [StockController::class, 'adjust'])->middleware('perm:inventory.adjust');
    Route::post('stock/damaged-sale', [StockController::class, 'damagedSale'])->middleware('perm:production.damaged.sell');
    Route::post('stock/wastage', [StockController::class, 'wastage'])->middleware('perm:production.wastage.manage');

    // ---------------- transfers ----------------
    Route::get('transfers', [TransferController::class, 'index'])->middleware('perm:inventory.view');
    Route::get('transfers/{id}', [TransferController::class, 'show'])->middleware('perm:inventory.view');
    Route::post('transfers', [TransferController::class, 'store'])->middleware('perm:inventory.transfer');
    Route::post('transfers/{id}/send', [TransferController::class, 'send'])->middleware('perm:inventory.transfer');
    Route::post('transfers/{id}/receive', [TransferController::class, 'receive'])->middleware('perm:inventory.receive');
    Route::post('transfers/{id}/approve-damaged', [TransferController::class, 'approveDamaged'])->middleware('perm:inventory.damaged_return');
    Route::post('transfers/{id}/cancel', [TransferController::class, 'cancel'])->middleware('perm:inventory.transfer');
    Route::delete('transfers/{id}', [TransferController::class, 'destroy'])->middleware('perm:inventory.transfer');

    // ---------------- sales ----------------
    // POS registers & held sales
    Route::get('pos/register', [PosController::class, 'openRegister'])->middleware('perm:pos.access');
    Route::post('pos/register', [PosController::class, 'storeRegister'])->middleware('perm:pos.access');
    Route::get('pos/register/{id}/summary', [PosController::class, 'registerSummary'])->middleware('perm:pos.access');
    Route::post('pos/register/{id}/close', [PosController::class, 'closeRegister'])->middleware('perm:pos.access');
    Route::get('pos/held', [PosController::class, 'heldIndex'])->middleware('perm:pos.access');
    Route::post('pos/held', [PosController::class, 'heldStore'])->middleware('perm:pos.access');
    Route::delete('pos/held/{id}', [PosController::class, 'heldDestroy'])->middleware('perm:pos.access');

    Route::get('sales', [SaleController::class, 'index'])->middleware('perm:sales.view');
    Route::get('sales/{id}', [SaleController::class, 'show'])->middleware('perm:sales.view');
    Route::post('sales', [SaleController::class, 'store'])->middleware('perm:sales.create,pos.access');
    Route::put('sales/{id}', [SaleController::class, 'update'])->middleware('perm:sales.edit,pos.access');
    Route::get('pos/customer-due', [SaleController::class, 'customerDue'])->middleware('perm:pos.access');
    Route::post('sales/{id}/payments', [SaleController::class, 'addPayment'])->middleware('perm:sales.payments');
    Route::post('sales/{id}/returns', [SaleController::class, 'storeReturn'])->middleware('perm:sales.return');

    // ---------------- purchases ----------------
    Route::get('purchases', [PurchaseController::class, 'index'])->middleware('perm:purchases.view');
    Route::get('purchases/{id}', [PurchaseController::class, 'show'])->middleware('perm:purchases.view');
    Route::post('purchases', [PurchaseController::class, 'store'])->middleware('perm:purchases.create');
    Route::put('purchases/{id}', [PurchaseController::class, 'update'])->middleware('perm:purchases.edit');
    Route::delete('purchases/{id}', [PurchaseController::class, 'destroy'])->middleware('perm:purchases.delete');
    Route::post('purchases/{id}/payments', [PurchaseController::class, 'addPayment'])->middleware('perm:purchases.payments');
    Route::post('purchases/{id}/returns', [PurchaseController::class, 'storeReturn'])->middleware('perm:purchases.return');

    // ---------------- ledgers ----------------
    Route::get('ledger/customer/{id}', [LedgerController::class, 'customer'])->middleware('perm:contacts.customers.ledger,reports.ledgers');
    Route::get('ledger/supplier/{id}', [LedgerController::class, 'supplier'])->middleware('perm:reports.ledgers');
    Route::get('ledger/outstanding', [LedgerController::class, 'outstanding'])->middleware('perm:reports.ledgers');
});
