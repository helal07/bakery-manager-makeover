<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stock balances and ledgers.
 *
 * showroom_id NULL  = factory stock (production / raw material store).
 * Ledger qty is signed: IN is positive, OUT is negative.
 *
 * Index choices mirror sql/36_ledger_ref_indexes.sql and
 * sql/37_performance_indexes.sql so batch history and stock reports
 * stay fast as the ledgers grow.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_stock', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->cascadeOnDelete();
            $table->decimal('quantity', 14, 4)->default(0);
            $table->decimal('min_stock', 14, 4)->default(0);
            $table->timestamps();

            // one balance row per product per location
            $table->unique(['product_id', 'showroom_id'], 'product_stock_unique');
            $table->index('showroom_id');
        });

        Schema::create('raw_material_stock', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('material_id')->constrained('raw_materials')->cascadeOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->cascadeOnDelete();
            $table->decimal('quantity', 14, 4)->default(0);
            $table->decimal('min_stock', 14, 4)->default(0);
            $table->timestamps();

            $table->unique(['material_id', 'showroom_id'], 'raw_material_stock_unique');
            $table->index('showroom_id');
        });

        Schema::create('stock_ledger', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->decimal('qty', 14, 4)->default(0);
            $table->string('kind', 48)->nullable();
            $table->string('ref_type', 48)->nullable();
            $table->uuid('ref_id')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index('ref_id', 'stock_ledger_ref_idx');
            // batch history: factory production rows by date
            $table->index(['kind', 'created_at'], 'stock_ledger_kind_created_idx');
            $table->index(['showroom_id', 'kind', 'created_at'], 'stock_ledger_loc_kind_created_idx');
            $table->index(['product_id', 'created_at'], 'stock_ledger_product_created_idx');
        });

        Schema::create('raw_stock_ledger', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('material_id')->nullable()->constrained('raw_materials')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->decimal('qty', 14, 4)->default(0);
            $table->string('kind', 48)->nullable();
            $table->string('ref_type', 48)->nullable();
            $table->uuid('ref_id')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();

            // the hot path: consumption lines of a batch (ref_id = batch ledger id)
            $table->index(['ref_id', 'kind'], 'raw_stock_ledger_ref_kind_idx');
            $table->index(['kind', 'created_at'], 'raw_stock_ledger_kind_created_idx');
            $table->index(['material_id', 'created_at'], 'raw_stock_ledger_material_created_idx');
            $table->index(['showroom_id', 'created_at'], 'raw_stock_ledger_loc_created_idx');
        });

        Schema::create('damaged_stock', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->cascadeOnDelete();
            $table->decimal('quantity', 14, 4)->default(0);
            $table->timestamp('updated_at')->nullable();

            $table->unique(['product_id', 'showroom_id'], 'damaged_stock_unique');
        });

        Schema::create('damaged_ledger', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->decimal('qty', 14, 4)->default(0);
            $table->string('kind', 48);
            $table->string('ref_type', 48)->nullable();
            $table->uuid('ref_id')->nullable();
            $table->decimal('sale_amount', 14, 2)->nullable();
            $table->string('customer_name')->nullable();
            $table->text('note')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['showroom_id', 'created_at']);
            $table->index('ref_id');
        });

        Schema::create('wastage_log', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('material_id')->nullable()->constrained('raw_materials')->nullOnDelete();
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->decimal('qty', 14, 4)->default(0);
            $table->string('reason')->nullable();
            $table->text('notes')->nullable();
            $table->uuid('ref_ledger_id')->nullable();
            $table->timestamp('logged_at')->nullable();
            $table->timestamps();

            $table->index(['showroom_id', 'logged_at']);
            $table->index('ref_ledger_id');
        });

        // finished goods returned from a showroom, waiting to become raw material
        Schema::create('repurpose_queue', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('qty', 14, 4)->default(0);
            $table->foreignUuid('source_showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->uuid('transfer_id')->nullable();
            $table->string('status', 32)->default('pending');
            $table->foreignUuid('converted_material_id')->nullable()->constrained('raw_materials')->nullOnDelete();
            $table->decimal('yield_qty', 14, 4)->nullable();
            $table->decimal('wastage_qty', 14, 4)->nullable();
            $table->text('note')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['status', 'created_at']);
            $table->index('transfer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('repurpose_queue');
        Schema::dropIfExists('wastage_log');
        Schema::dropIfExists('damaged_ledger');
        Schema::dropIfExists('damaged_stock');
        Schema::dropIfExists('raw_stock_ledger');
        Schema::dropIfExists('stock_ledger');
        Schema::dropIfExists('raw_material_stock');
        Schema::dropIfExists('product_stock');
    }
};
