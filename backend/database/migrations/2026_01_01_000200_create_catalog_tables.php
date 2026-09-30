<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catalog: product categories, products, raw materials,
 * selling price groups and per-group product prices.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->timestamps();

            $table->index('name');
        });

        Schema::create('selling_price_groups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('name');
        });

        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('sku')->nullable();
            $table->string('name');
            $table->string('category')->nullable();
            $table->foreignUuid('category_id')->nullable()->constrained('product_categories')->nullOnDelete();
            $table->string('unit', 32)->nullable();
            $table->decimal('price', 14, 2)->default(0);
            $table->decimal('cost', 14, 2)->default(0);
            $table->decimal('transfer_price', 14, 2)->default(0);
            $table->decimal('threshold', 14, 4)->default(0);
            $table->integer('shelf_life_days')->nullable();
            $table->date('mfg_date')->nullable();
            $table->date('expiry_date')->nullable();
            $table->string('image_url', 1024)->nullable();
            $table->string('barcode')->nullable();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('show_on_landing')->default(false);
            $table->timestamps();

            // SKU index for search & lookups (non-unique to support legacy duplicate/multilingual SKUs)
            $table->index('sku');
            $table->index('barcode');
            $table->index(['is_active', 'name']);
            $table->index('category_id');
            $table->index('show_on_landing');
        });

        Schema::create('raw_materials', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('unit', 32)->nullable();
            $table->decimal('cost', 14, 4)->default(0);
            $table->decimal('min_stock', 14, 4)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'name']);
        });

        Schema::create('product_selling_prices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignUuid('selling_price_group_id')->nullable()->constrained('selling_price_groups')->cascadeOnDelete();
            $table->decimal('price', 14, 2)->default(0);
            $table->timestamps();

            $table->unique(['product_id', 'selling_price_group_id'], 'psp_product_group_unique');
            $table->index('selling_price_group_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_selling_prices');
        Schema::dropIfExists('raw_materials');
        Schema::dropIfExists('products');
        Schema::dropIfExists('selling_price_groups');
        Schema::dropIfExists('product_categories');
    }
};
