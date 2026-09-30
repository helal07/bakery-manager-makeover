<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recipes, sub-recipes, production overheads, work orders and QC.
 *
 * A recipe line points either at a raw material OR at a sub-recipe.
 * Sub-recipes are expanded into raw materials when a batch is produced.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recipe_categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('color', 32)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('name');
        });

        Schema::create('sub_recipes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->decimal('yield_qty', 14, 4)->default(1);
            $table->string('yield_unit', 32)->default('kg');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('name');
        });

        Schema::create('sub_recipe_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('sub_recipe_id')->constrained('sub_recipes')->cascadeOnDelete();
            $table->foreignUuid('material_id')->constrained('raw_materials')->cascadeOnDelete();
            $table->decimal('qty', 14, 4)->default(0);
            $table->timestamps();

            $table->unique(['sub_recipe_id', 'material_id'], 'sri_recipe_material_unique');
            $table->index('material_id');
        });

        Schema::create('recipes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignUuid('material_id')->nullable()->constrained('raw_materials')->cascadeOnDelete();
            $table->foreignUuid('sub_recipe_id')->nullable()->constrained('sub_recipes')->cascadeOnDelete();
            $table->foreignUuid('category_id')->nullable()->constrained('recipe_categories')->nullOnDelete();
            $table->decimal('qty', 14, 4)->default(0);
            $table->timestamps();

            $table->index('product_id');
            $table->index('material_id');
            $table->index('sub_recipe_id');
        });

        Schema::create('production_overhead_categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('name');
        });

        // per-product default overhead: mode = 'per_batch' | 'per_unit'
        Schema::create('recipe_overheads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignUuid('category_id')->constrained('production_overhead_categories')->cascadeOnDelete();
            $table->decimal('amount', 14, 2)->default(0);
            $table->string('mode', 32)->default('per_batch');
            $table->timestamps();

            $table->unique(['product_id', 'category_id'], 'ro_product_category_unique');
        });

        // actual overhead booked against one produced batch
        Schema::create('production_overheads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('batch_id'); // stock_ledger row id of the production entry
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignUuid('category_id')->constrained('production_overhead_categories')->cascadeOnDelete();
            $table->decimal('amount', 14, 2)->default(0);
            $table->text('note')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('batch_id');
            $table->index('product_id');
            $table->index('category_id');
        });

        Schema::create('work_orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->decimal('batch_qty', 14, 4)->default(0);
            $table->string('batch_id')->nullable();
            $table->string('assigned_to')->nullable();
            $table->string('status', 32)->default('planned');
            $table->date('planned_date')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['status', 'planned_date']);
            $table->index('product_id');
        });

        Schema::create('qc_checks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('batch_id')->nullable();
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->string('result', 32)->default('pass');
            $table->text('notes')->nullable();
            $table->timestamp('checked_at')->nullable();
            $table->timestamps();

            $table->index('batch_id');
            $table->index(['product_id', 'checked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qc_checks');
        Schema::dropIfExists('work_orders');
        Schema::dropIfExists('production_overheads');
        Schema::dropIfExists('recipe_overheads');
        Schema::dropIfExists('production_overhead_categories');
        Schema::dropIfExists('recipes');
        Schema::dropIfExists('sub_recipe_items');
        Schema::dropIfExists('sub_recipes');
        Schema::dropIfExists('recipe_categories');
    }
};
