/** Public tables in FK-safe order (parents first). Restore deletes in reverse. */
export const BACKUP_TABLES = [
  "app_roles",
  "permissions",
  "role_permissions",
  "showrooms",
  "user_roles",
  "user_role_assignments",
  "user_profiles",
  "units",
  "product_categories",
  "selling_price_groups",
  "customer_groups",
  "customers",
  "suppliers",
  "raw_materials",
  "products",
  "employees",
  "product_selling_prices",
  "product_stock",
  "raw_material_stock",
  "recipe_categories",
  "sub_recipes",
  "sub_recipe_items",
  "recipes",
  "production_overhead_categories",
  "recipe_overheads",
  "production_overheads",
  "expense_categories",
  "expenses",
  "purchase_categories",
  "purchases",
  "purchase_items",
  "purchase_returns",
  "purchase_return_items",
  "supplier_payments",
  "cash_registers",
  "sales",
  "sale_items",
  "sale_payments",
  "sale_returns",
  "sale_return_items",
  "customer_payments",
  "held_sales",
  "orders",
  "transfers",
  "transfer_items",
  "stock_ledger",
  "raw_stock_ledger",
  "damaged_stock",
  "damaged_ledger",
  "repurpose_queue",
  "wastage_log",
  "work_orders",
  "qc_checks",
  "company_settings",
  "landing_content",
  "landing_carousels",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupFile = {
  format: "bakery-manager-db-dump";
  version: 1;
  createdAt: string;
  tables: Record<string, any[]>;
  counts: Record<string, number>;
};
