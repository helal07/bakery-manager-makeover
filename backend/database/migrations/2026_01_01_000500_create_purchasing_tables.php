<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Suppliers, purchases, purchase returns and supplier payments.
 * due = total - paid, kept on the row so the supplier ledger stays cheap.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'name']);
            $table->index('phone');
        });

        Schema::create('purchase_categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('name');
        });

        Schema::create('purchases', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->nullable();
            $table->foreignUuid('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->foreignUuid('category_id')->nullable()->constrained('purchase_categories')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->date('purchase_date');
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('tax', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->decimal('paid', 14, 2)->default(0);
            $table->decimal('due', 14, 2)->default(0);
            $table->string('status', 32)->default('received');
            $table->string('payment', 32)->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->unique('code');
            $table->index(['showroom_id', 'purchase_date']);
            $table->index(['supplier_id', 'purchase_date']);
            $table->index(['status', 'purchase_date']);
        });

        Schema::create('purchase_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('purchase_id')->nullable()->constrained('purchases')->cascadeOnDelete();
            $table->foreignUuid('material_id')->nullable()->constrained('raw_materials')->nullOnDelete();
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('name')->nullable();
            $table->string('unit', 32)->nullable();
            $table->decimal('qty', 14, 4)->default(0);
            $table->decimal('price', 14, 4)->default(0);
            $table->timestamps();

            $table->index('purchase_id');
            $table->index('material_id');
            $table->index('product_id');
        });

        Schema::create('purchase_returns', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->nullable();
            $table->foreignUuid('purchase_id')->nullable()->constrained('purchases')->nullOnDelete();
            $table->foreignUuid('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->string('invoice_ref')->nullable();
            $table->decimal('amount', 14, 2)->default(0);
            $table->string('reason')->nullable();
            $table->text('note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->unique('code');
            $table->index(['showroom_id', 'created_at']);
            $table->index(['supplier_id', 'created_at']);
        });

        Schema::create('purchase_return_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('return_id')->nullable()->constrained('purchase_returns')->cascadeOnDelete();
            $table->foreignUuid('material_id')->nullable()->constrained('raw_materials')->nullOnDelete();
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('name')->nullable();
            $table->string('unit', 32)->nullable();
            $table->decimal('qty', 14, 4)->default(0);
            $table->decimal('price', 14, 4)->default(0);
            $table->timestamps();

            $table->index('return_id');
        });

        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->foreignUuid('purchase_id')->nullable()->constrained('purchases')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->decimal('amount', 14, 2)->default(0);
            $table->string('method', 32)->nullable();
            $table->string('reference')->nullable();
            $table->text('note')->nullable();
            $table->date('paid_on');
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->index(['supplier_id', 'paid_on']);
            $table->index(['purchase_id', 'paid_on']);
            $table->index(['showroom_id', 'paid_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_payments');
        Schema::dropIfExists('purchase_return_items');
        Schema::dropIfExists('purchase_returns');
        Schema::dropIfExists('purchase_items');
        Schema::dropIfExists('purchases');
        Schema::dropIfExists('purchase_categories');
        Schema::dropIfExists('suppliers');
    }
};
