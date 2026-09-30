<?php

namespace Database\Seeders;

use App\Models\AppRole;
use App\Models\CompanySetting;
use App\Models\Permission;
use App\Models\RolePermission;
use App\Models\Showroom;
use App\Models\User;
use App\Models\UserProfile;
use App\Models\UserRole;
use App\Models\UserRoleAssignment;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Permissions list
        $permissions = [
            'contacts.customers.ledger',
            'contacts.customers.manage',
            'contacts.customers.view',
            'contacts.suppliers.manage',
            'contacts.suppliers.view',
            'dashboard.access',
            'employees.manage',
            'employees.view',
            'expenses.categories.manage',
            'expenses.manage',
            'expenses.view',
            'inventory.adjust',
            'inventory.damaged_return',
            'inventory.receive',
            'inventory.transfer',
            'inventory.view',
            'pos.access',
            'pos.discount',
            'pos.void',
            'production.access',
            'production.batches',
            'production.batches.delete',
            'production.batches.edit',
            'production.damaged.sell',
            'production.factory_stock.view',
            'production.labels.print',
            'production.overheads.manage',
            'production.raw_materials.manage',
            'production.raw_materials.view',
            'production.recipes.manage',
            'production.recipes.view',
            'production.reports.batch_history',
            'production.reports.consumption',
            'production.reports.cost',
            'production.reports.daily_register',
            'production.reports.overhead',
            'production.reports.profit_loss',
            'production.reports.view',
            'production.repurpose',
            'production.sub_recipes.manage',
            'production.wastage.manage',
            'products.categories.manage',
            'products.create',
            'products.delete',
            'products.edit',
            'products.selling_prices.manage',
            'products.units.manage',
            'products.view',
            'purchases.create',
            'purchases.delete',
            'purchases.edit',
            'purchases.payments.manage',
            'purchases.returns.manage',
            'purchases.view',
            'reports.audit_log',
            'reports.damaged_stock',
            'reports.inventory',
            'reports.landing_content',
            'reports.pos_summary',
            'reports.production',
            'reports.purchases',
            'reports.sales',
            'reports.transfers',
            'reports.view',
            'reports.wastage',
            'sales.create',
            'sales.delete',
            'sales.due_collection',
            'sales.edit',
            'sales.payments.manage',
            'sales.returns.manage',
            'sales.shipping',
            'sales.view',
            'settings.company.manage',
            'settings.manage',
            'settings.pos.manage',
            'settings.roles.manage',
            'settings.showrooms.manage',
            'settings.units.manage',
            'settings.users.manage',
        ];

        $permissionIds = [];
        foreach ($permissions as $permKey) {
            $parts = explode('.', $permKey);
            $module = $parts[0] ?? 'general';
            $label = ucwords(str_replace(['.', '_'], ' ', $permKey));

            $perm = Permission::firstOrCreate(
                ['permission_key' => $permKey],
                [
                    'module' => $module,
                    'label' => $label,
                ]
            );
            $permissionIds[] = $perm->id;
        }

        // 2. Roles
        $superRole = AppRole::firstOrCreate(
            ['name' => 'superadmin'],
            [
                'description' => 'Full administrative access across all locations and modules',
                'is_active' => true,
                'is_system' => true,
            ]
        );

        // Assign all permissions to superadmin role
        foreach ($permissions as $pKey) {
            RolePermission::firstOrCreate([
                'role_id' => $superRole->id,
                'permission_key' => $pKey,
            ]);
        }

        // 3. Default Showroom
        $showroom = Showroom::firstOrCreate(
            ['code' => 'MAIN'],
            [
                'name' => 'Main Bakery Showroom',
                'city' => 'Dhaka',
                'is_active' => true,
            ]
        );

        // 4. Default Company Settings
        CompanySetting::firstOrCreate(
            ['is_current' => true],
            [
                'name' => 'Bakery Production & POS',
                'currency' => 'BDT',
                'address' => 'Dhaka, Bangladesh',
                'is_current' => true,
            ]
        );

        // 5. Default Superadmin User
        $user = User::firstOrCreate(
            ['email' => 'admin@bakery.com'],
            [
                'name' => 'Super Admin',
                'password' => 'password123',
                'is_active' => true,
            ]
        );

        UserProfile::firstOrCreate(
            ['user_id' => $user->id],
            [
                'name' => 'Super Admin',
                'email' => 'admin@bakery.com',
            ]
        );

        UserRole::firstOrCreate([
            'user_id' => $user->id,
            'role' => 'superadmin',
        ]);

        UserRoleAssignment::firstOrCreate([
            'user_id' => $user->id,
            'role_id' => $superRole->id,
            'showroom_id' => null, // Global access
        ]);
    }
}
