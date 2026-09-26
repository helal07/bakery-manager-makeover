<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Core tables: locations (showrooms), units, company settings,
 * users, profiles and the full RBAC catalog.
 *
 * Money  -> decimal(14, 2)
 * Qty    -> decimal(14, 4)  (recipes need 4 decimal places)
 */
return new class extends Migration
{
    public function up(): void
    {
        // ---------- users (Laravel auth + Sanctum) ----------
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name')->nullable();
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->boolean('is_active')->default(true);
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignUuid('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });

        // ---------- showrooms (locations; is_factory = factory) ----------
        Schema::create('showrooms', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('code')->nullable();
            $table->string('city')->nullable();
            $table->text('address')->nullable();
            $table->string('phone')->nullable();
            $table->string('manager_name')->nullable();
            $table->boolean('is_factory')->default(false);
            $table->boolean('is_active')->default(true);
            $table->json('settings')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->index('is_active');
            $table->index('is_factory');
        });

        // ---------- units ----------
        Schema::create('units', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('code');
            $table->string('short_name')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('code');
        });

        // ---------- company settings (single current row) ----------
        Schema::create('company_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name')->nullable();
            $table->string('tagline')->nullable();
            $table->string('logo_url', 1024)->nullable();
            $table->text('address')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('vat_reg')->nullable();
            $table->text('footer_note')->nullable();
            $table->string('currency', 16)->default('BDT');
            $table->json('settings')->nullable();
            $table->boolean('is_current')->default(true);
            $table->timestamps();

            $table->index('is_current');
        });

        // ---------- user profiles ----------
        Schema::create('user_profiles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('avatar_url', 1024)->nullable();
            $table->text('bio')->nullable();
            $table->string('language', 8)->default('en');
            $table->string('timezone', 64)->default('Asia/Dhaka');
            $table->json('software')->nullable();
            $table->timestamps();

            $table->unique('user_id');
        });

        // ---------- RBAC: roles / permissions ----------
        Schema::create('app_roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_system')->default(false);
            $table->timestamps();

            $table->unique('name');
        });

        Schema::create('permissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('permission_key');
            $table->string('module')->nullable();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique('permission_key');
            $table->index('module');
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('role_id')->constrained('app_roles')->cascadeOnDelete();
            $table->string('permission_key');
            $table->timestamps();

            $table->unique(['role_id', 'permission_key']);
            // permission lookups run on every request
            $table->index(['permission_key', 'role_id']);
        });

        // fixed role ladder, mirrors the app_role enum
        Schema::create('user_roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('role', [
                'superadmin', 'owner', 'admin', 'manager', 'cashier', 'staff', 'employee',
            ]);
            $table->timestamps();

            $table->unique(['user_id', 'role']);
            $table->index('role');
        });

        // role + location assignment (showroom_id NULL = factory / global)
        Schema::create('user_role_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUuid('role_id')->nullable()->constrained('app_roles')->nullOnDelete();
            $table->foreignUuid('showroom_id')->nullable()->constrained('showrooms')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['user_id', 'showroom_id']);
            $table->index(['user_id', 'role_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_role_assignments');
        Schema::dropIfExists('user_roles');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('app_roles');
        Schema::dropIfExists('user_profiles');
        Schema::dropIfExists('company_settings');
        Schema::dropIfExists('units');
        Schema::dropIfExists('showrooms');
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};
