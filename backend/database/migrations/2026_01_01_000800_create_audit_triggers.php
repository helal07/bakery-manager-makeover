<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Port of audit_row_change(): MySQL triggers write every insert / update / delete
 * on the audited tables into audit_log, like the current database does.
 * The acting user comes from @app_user_id / @app_user_email, which the
 * `staff` middleware sets on every API request. Secret columns are redacted.
 */
return new class extends Migration
{
    private const TABLES = [
        'sales', 'sale_items', 'sale_returns', 'customer_payments', 'purchases', 'purchase_items',
        'purchase_returns', 'supplier_payments', 'transfers', 'transfer_items', 'products',
        'raw_materials', 'recipes', 'sub_recipes', 'sub_recipe_items', 'wastage_log',
        'repurpose_queue', 'production_overheads', 'customers', 'suppliers', 'showrooms',
        'company_settings', 'employees', 'app_roles', 'role_permissions', 'user_role_assignments',
        'user_roles', 'expenses',
    ];

    private const REDACT = ['password', 'password_hash', 'token', 'access_token', 'refresh_token', 'secret', 'remember_token'];

    private function json(string $alias, array $cols): string
    {
        $parts = [];
        foreach ($cols as $c) {
            $v = in_array($c, self::REDACT, true) ? "'[redacted]'" : "{$alias}.`{$c}`";
            $parts[] = "'{$c}', {$v}";
        }

        return 'JSON_OBJECT('.implode(', ', $parts).')';
    }

    public function up(): void
    {
        foreach (self::TABLES as $t) {
            if (! Schema::hasTable($t)) {
                continue;
            }
            $cols = Schema::getColumnListing($t);
            $has = fn ($c) => in_array($c, $cols, true);
            $rid = fn ($a) => $has('id') ? "{$a}.id" : 'NULL';
            $shop = fn ($a) => $has('showroom_id') ? "{$a}.showroom_id" : 'NULL';
            $ins = "INSERT INTO audit_log (id, occurred_at, actor_id, actor_email, action, table_name, record_id, showroom_id, changed_fields, old_data, new_data)";

            $changed = [];
            foreach ($cols as $c) {
                if ($c !== 'updated_at') {
                    $changed[] = "IF(OLD.`{$c}` <=> NEW.`{$c}`, NULL, '{$c}')";
                }
            }
            $changedList = 'CONCAT_WS(\',\', '.implode(', ', $changed).')';

            $this->drop($t);
            DB::unprepared("CREATE TRIGGER trg_audit_{$t}_ins AFTER INSERT ON `{$t}` FOR EACH ROW
                {$ins} VALUES (UUID(), NOW(), @app_user_id, @app_user_email, 'insert', '{$t}', {$rid('NEW')}, {$shop('NEW')}, NULL, NULL, {$this->json('NEW', $cols)})");
            DB::unprepared("CREATE TRIGGER trg_audit_{$t}_del AFTER DELETE ON `{$t}` FOR EACH ROW
                {$ins} VALUES (UUID(), NOW(), @app_user_id, @app_user_email, 'delete', '{$t}', {$rid('OLD')}, {$shop('OLD')}, NULL, {$this->json('OLD', $cols)}, NULL)");
            DB::unprepared("CREATE TRIGGER trg_audit_{$t}_upd AFTER UPDATE ON `{$t}` FOR EACH ROW
                BEGIN
                  DECLARE _ch TEXT DEFAULT {$changedList};
                  IF _ch IS NOT NULL AND _ch <> '' THEN
                    {$ins} VALUES (UUID(), NOW(), @app_user_id, @app_user_email, 'update', '{$t}', {$rid('NEW')}, {$shop('NEW')},
                      CAST(CONCAT('[\"', REPLACE(_ch, ',', '\",\"'), '\"]') AS JSON), {$this->json('OLD', $cols)}, {$this->json('NEW', $cols)});
                  END IF;
                END");
        }
    }

    private function drop(string $t): void
    {
        foreach (['ins', 'upd', 'del'] as $k) {
            DB::unprepared("DROP TRIGGER IF EXISTS trg_audit_{$t}_{$k}");
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $t) {
            $this->drop($t);
        }
    }
};
