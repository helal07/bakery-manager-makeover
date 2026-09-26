<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customers, POS registers, sales, sale returns and customer payments.
 *
 * due = total - paid on the sale row:
 *   due  > 0  -> Due / Partial
 *   due  < 0  -> Advance
 *   due <= 0 and paid > 0 -> Paid
 * The sales list filters on exactly these, so due is indexed with the date.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_groups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->decimal('discount_pct', 8, 4)->default(0);
            $table->string('pricing_mode', 32)->default('discount');
            $table->foreignUuid('selling_price_group_id')->nullable()->constrained('selling_price_groups')->nullOnDelete();
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('name');
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            $table->decimal('loyalty_points', 14, 2)->default(0);
            $table->string('avatar_url', 1024)->nullable();
            $table->foreignUuid('group_id')->nullable()->constrained('customer_groups')->nullOnDelete();
            $table->foreignUuid('selling_price_group_id')->nullable()->constrained('selling_price_groups')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'name']);
            $table->index('phone');
        });

        Schema::create('cash_registers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->uuid('cashier_id')->nullable();
            $table->uuid('opened_by')->nullable();
            $table->uuid('closed_by')->nullable();
            $table->decimal('opening_float', 14, 2)->default(0);
            $table->decimal('closing_cash', 14, 2)->nullable();
            $table->decimal('expected_cash', 14, 2)->nullable();
            $table->decimal('difference', 14, 2)->nullable();
            $table->string('status', 32)->default('open');
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->text('note_open')->nullable();
            $table->text('note_close')->nullable();
            $table->timestamps();

            $table->index(['showroom_id', 'status']);
            $table->index(['showroom_id', 'opened_at']);
        });

        Schema::create('sales', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('external_ref')->nullable();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->foreignUuid('register_id')->nullable()->constrained('cash_registers')->nullOnDelete();
            $table->uuid('cashier_id')->nullable();
            $table->foreignUuid('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('customer_name')->nullable();
            $table->string('customer_phone')->nullable();
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('tax', 14, 2)->default(0);
            $table->decimal('shipping', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->decimal('paid', 14, 2)->default(0);
            $table->decimal('due', 14, 2)->default(0);
            $table->string('payment_mode', 32)->nullable();
            $table->timestamps();

            $table->index('external_ref');
            $table->index(['showroom_id', 'created_at']);
            $table->index(['customer_id', 'created_at']);
            $table->index(['cashier_id', 'created_at']);
            $table->index(['due', 'created_at']);
            $table->index('created_at');
        });

        Schema::create('sale_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('sale_id')->constrained('sales')->cascadeOnDelete();
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('product_name')->nullable();
            $table->string('product_sku')->nullable();
            $table->decimal('qty', 14, 4)->default(0);
            $table->decimal('unit_price', 14, 2)->default(0);
            $table->decimal('line_total', 14, 2)->default(0);
            $table->timestamps();

            $table->index('sale_id');
            $table->index(['product_id', 'created_at']);
        });

        Schema::create('sale_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('sale_id')->constrained('sales')->cascadeOnDelete();
            $table->string('method', 32);
            $table->decimal('amount', 14, 2)->default(0);
            $table->string('reference')->nullable();
            $table->timestamps();

            $table->index('sale_id');
            $table->index(['method', 'created_at']);
        });

        Schema::create('sale_returns', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->nullable();
            $table->foreignUuid('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->string('invoice_ref')->nullable();
            $table->string('customer_name')->nullable();
            $table->decimal('amount', 14, 2)->default(0);
            $table->string('reason')->nullable();
            $table->text('note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->unique('code');
            $table->index(['showroom_id', 'created_at']);
            $table->index('sale_id');
        });

        Schema::create('sale_return_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('return_id')->nullable()->constrained('sale_returns')->cascadeOnDelete();
            $table->foreignUuid('sale_item_id')->nullable()->constrained('sale_items')->nullOnDelete();
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('product_name')->nullable();
            $table->decimal('qty', 14, 4)->default(0);
            $table->decimal('line_total', 14, 2)->default(0);
            $table->string('condition', 32)->nullable(); // good | damaged
            $table->timestamps();

            $table->index('return_id');
        });

        Schema::create('customer_payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignUuid('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->string('invoice_ref')->nullable();
            $table->string('customer_name')->nullable();
            $table->string('customer_phone')->nullable();
            $table->decimal('amount', 14, 2)->default(0);
            $table->string('method', 32)->nullable();
            $table->string('reference')->nullable();
            $table->text('note')->nullable();
            $table->date('paid_on');
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'paid_on']);
            $table->index(['sale_id', 'paid_on']);
            $table->index(['showroom_id', 'paid_on']);
        });

        // parked POS carts
        Schema::create('held_sales', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->cascadeOnDelete();
            $table->uuid('cashier_id')->nullable();
            $table->foreignUuid('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('customer_name')->nullable();
            $table->string('customer_phone')->nullable();
            $table->string('label')->nullable();
            $table->json('snapshot')->nullable();
            $table->json('items')->nullable();
            $table->integer('item_count')->default(0);
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('tax', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['showroom_id', 'created_at']);
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->nullable();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->foreignUuid('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('customer_name')->nullable();
            $table->string('customer_phone')->nullable();
            $table->string('order_type', 32)->nullable();
            $table->string('status', 32)->default('pending');
            $table->json('items')->nullable();
            $table->decimal('total', 14, 2)->default(0);
            $table->date('due_date')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();

            $table->unique('code');
            $table->index(['showroom_id', 'status']);
            $table->index(['status', 'due_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
        Schema::dropIfExists('held_sales');
        Schema::dropIfExists('customer_payments');
        Schema::dropIfExists('sale_return_items');
        Schema::dropIfExists('sale_returns');
        Schema::dropIfExists('sale_payments');
        Schema::dropIfExists('sale_items');
        Schema::dropIfExists('sales');
        Schema::dropIfExists('cash_registers');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('customer_groups');
    }
};
