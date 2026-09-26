<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Factory <-> showroom transfers, employees, expenses,
 * the audit trail and public landing page content.
 *
 * transfer_items.unit_price carries the transfer (supply) price,
 * so factory-to-showroom margin stays reportable after the fact.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transfers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('code')->nullable();
            $table->foreignUuid('source_showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->foreignUuid('dest_showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->string('kind', 32)->nullable(); // product | material | damaged
            $table->string('status', 32)->default('draft');
            $table->text('note')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();

            $table->unique('code');
            $table->index(['status', 'created_at']);
            $table->index(['source_showroom_id', 'created_at']);
            $table->index(['dest_showroom_id', 'created_at']);
        });

        Schema::create('transfer_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('transfer_id')->constrained('transfers')->cascadeOnDelete();
            $table->foreignUuid('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignUuid('material_id')->nullable()->constrained('raw_materials')->nullOnDelete();
            $table->decimal('qty', 14, 4)->default(0);
            $table->decimal('unit_price', 14, 2)->nullable();
            $table->timestamps();

            $table->index('transfer_id');
            $table->index('product_id');
            $table->index('material_id');
        });

        Schema::create('employees', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('role')->nullable();
            $table->foreignUuid('role_id')->nullable()->constrained('app_roles')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->foreignUuid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('designation')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->text('address')->nullable();
            $table->string('national_id')->nullable();
            $table->decimal('salary', 14, 2)->nullable();
            $table->decimal('attendance', 8, 2)->nullable();
            $table->date('joining_date')->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('gender', 16)->nullable();
            $table->string('emergency_contact')->nullable();
            $table->string('emergency_phone')->nullable();
            $table->text('notes')->nullable();
            $table->string('avatar_url', 1024)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['showroom_id', 'is_active']);
            $table->index('user_id');
        });

        Schema::create('expense_categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('name');
        });

        Schema::create('expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('category_id')->nullable()->constrained('expense_categories')->nullOnDelete();
            $table->string('category')->nullable();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->decimal('amount', 14, 2)->default(0);
            $table->text('note')->nullable();
            $table->date('expense_date');
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->index(['showroom_id', 'expense_date']);
            $table->index(['category_id', 'expense_date']);
        });

        Schema::create('audit_log', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->timestamp('occurred_at')->nullable();
            $table->uuid('actor_id')->nullable();
            $table->string('actor_email')->nullable();
            $table->string('action', 48);
            $table->string('table_name')->nullable();
            $table->uuid('record_id')->nullable();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->nullOnDelete();
            $table->json('changed_fields')->nullable();
            $table->json('old_data')->nullable();
            $table->json('new_data')->nullable();
            $table->text('note')->nullable();

            $table->index('occurred_at');
            $table->index(['table_name', 'record_id']);
            $table->index(['actor_id', 'occurred_at']);
        });

        Schema::create('landing_content', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('section')->nullable();
            $table->json('content')->nullable();
            $table->boolean('is_current')->default(true);
            $table->uuid('updated_by')->nullable();
            $table->timestamps();

            $table->index(['section', 'is_current']);
        });

        Schema::create('landing_carousels', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('title');
            $table->string('subtitle')->nullable();
            $table->string('image_url', 1024);
            $table->string('link_url', 1024)->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('landing_carousels');
        Schema::dropIfExists('landing_content');
        Schema::dropIfExists('audit_log');
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('expense_categories');
        Schema::dropIfExists('employees');
        Schema::dropIfExists('transfer_items');
        Schema::dropIfExists('transfers');
    }
};
