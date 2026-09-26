<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BusinessRuleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Full database export / restore in the same JSON format the app already uses
 * ("bakery-manager-db-dump"), so a file exported today can be restored into MySQL.
 */
class BackupController extends Controller
{
    /** FK-safe order (parents first) — same list as src/lib/backup-tables.ts. */
    private const TABLES = [
        'app_roles', 'permissions', 'role_permissions', 'showrooms', 'user_roles', 'user_role_assignments',
        'user_profiles', 'units', 'product_categories', 'selling_price_groups', 'customer_groups', 'customers',
        'suppliers', 'raw_materials', 'products', 'employees', 'product_selling_prices', 'product_stock',
        'raw_material_stock', 'recipe_categories', 'sub_recipes', 'sub_recipe_items', 'recipes',
        'production_overhead_categories', 'recipe_overheads', 'production_overheads', 'expense_categories',
        'expenses', 'purchase_categories', 'purchases', 'purchase_items', 'purchase_returns',
        'purchase_return_items', 'supplier_payments', 'cash_registers', 'sales', 'sale_items', 'sale_payments',
        'sale_returns', 'customer_payments', 'held_sales', 'orders', 'stock_ledger', 'raw_stock_ledger',
        'damaged_stock', 'damaged_ledger', 'transfers', 'transfer_items', 'repurpose_queue', 'wastage_log',
        'qc_checks', 'company_settings', 'landing_content', 'landing_carousels', 'unit_conversions',
    ];

    private function ensureAdmin(Request $request): void
    {
        $ok = DB::table('user_roles')->where('user_id', $request->user()->id)
            ->whereIn(DB::raw('lower(role)'), ['owner', 'admin', 'superadmin'])->exists();
        if (! $ok) {
            throw new BusinessRuleException('Only owner or admin can export or restore backups', true);
        }
    }

    private function tables(): array
    {
        return array_values(array_filter(self::TABLES, fn ($t) => Schema::hasTable($t)));
    }

    public function export(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);
        @set_time_limit(300);
        $tables = [];
        $counts = [];
        foreach ($this->tables() as $t) {
            $rows = [];
            $q = DB::table($t);
            if (Schema::hasColumn($t, 'id')) {
                $q->orderBy('id');
            }
            foreach ($q->cursor() as $r) {
                $rows[] = $r;
            }
            $tables[$t] = $rows;
            $counts[$t] = count($rows);
        }

        return response()->json(['dump' => [
            'format' => 'bakery-manager-db-dump', 'version' => 1,
            'createdAt' => now()->toIso8601String(), 'tables' => $tables, 'counts' => $counts,
        ], 'skipped' => []]);
    }

    /** Turn one exported value into something MySQL accepts. */
    private function cell($v)
    {
        if (is_array($v) || is_object($v)) {
            return json_encode($v);
        }
        if (is_bool($v)) {
            return $v ? 1 : 0;
        }
        if (is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/', $v)) {
            try {
                return \Carbon\Carbon::parse($v)->utc()->format('Y-m-d H:i:s');
            } catch (\Throwable) {
                return $v;
            }
        }

        return $v;
    }

    /** Destructive: wipes every table, then re-inserts the file. */
    public function restore(Request $request): JsonResponse
    {
        $this->ensureAdmin($request);
        $dump = $request->input('dump');
        if (! is_array($dump) || ($dump['format'] ?? null) !== 'bakery-manager-db-dump' || ! is_array($dump['tables'] ?? null)) {
            throw new BusinessRuleException('This file is not a database backup created by this app');
        }
        @set_time_limit(600);
        $inserted = [];
        $errors = [];
        $tables = $this->tables();

        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach (array_reverse($tables) as $t) {
                try {
                    DB::table($t)->delete();
                } catch (\Throwable $e) {
                    $errors[] = ['table' => $t, 'stage' => 'delete', 'error' => $e->getMessage()];
                }
            }
            foreach ($tables as $t) {
                $rows = $dump['tables'][$t] ?? [];
                if (! is_array($rows) || ! $rows) {
                    continue;
                }
                $cols = array_flip(Schema::getColumnListing($t));
                $ok = 0;
                foreach (array_chunk($rows, 500) as $chunk) {
                    $clean = array_map(fn ($r) => array_map(fn ($v) => $this->cell($v), array_intersect_key((array) $r, $cols)), $chunk);
                    try {
                        DB::table($t)->insert($clean);
                        $ok += count($clean);
                    } catch (\Throwable $e) {
                        $errors[] = ['table' => $t, 'stage' => 'insert', 'error' => $e->getMessage()];
                        break;
                    }
                }
                $inserted[$t] = $ok;
            }
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        return response()->json(['inserted' => $inserted, 'errors' => $errors]);
    }
}
