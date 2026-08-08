/**
 * Single source of truth for RBAC expectations.
 *
 * `PERMISSION_CATALOG` mirrors the `permissions` table, `ROUTE_GUARDS` mirrors
 * the `PermissionGate anyOf` / sidebar `permission` declarations, and
 * `ROLE_MATRIX` is the intended permission set for each built-in role.
 *
 * Tests use these to prove that every report route and every staff-only RPC is
 * blocked or allowed exactly as the matrix says.
 */

export const PERMISSION_CATALOG = [
  "contacts.customers.ledger",
  "contacts.customers.manage",
  "contacts.customers.view",
  "contacts.suppliers.manage",
  "contacts.suppliers.view",
  "dashboard.access",
  "employees.manage",
  "employees.view",
  "expenses.categories.manage",
  "expenses.manage",
  "expenses.view",
  "inventory.adjust",
  "inventory.damaged_return",
  "inventory.receive",
  "inventory.transfer",
  "inventory.view",
  "pos.access",
  "pos.discount",
  "pos.void",
  "production.access",
  "production.batches",
  "production.damaged.sell",
  "production.factory_stock.view",
  "production.labels.print",
  "production.overheads.manage",
  "production.raw_materials.manage",
  "production.raw_materials.view",
  "production.recipes.manage",
  "production.recipes.view",
  "production.reports.batch_history",
  "production.reports.consumption",
  "production.reports.cost",
  "production.reports.daily_register",
  "production.reports.overhead",
  "production.reports.profit_loss",
  "production.reports.view",
  "production.repurpose",
  "production.sub_recipes.manage",
  "production.wastage.manage",
  "products.categories.manage",
  "products.create",
  "products.delete",
  "products.edit",
  "products.selling_prices.manage",
  "products.units.manage",
  "products.view",
  "purchases.create",
  "purchases.delete",
  "purchases.edit",
  "purchases.payments",
  "purchases.return",
  "purchases.view",
  "reports.expenses",
  "reports.ledgers",
  "reports.purchase",
  "reports.sales",
  "reports.stock",
  "sales.create",
  "sales.delete",
  "sales.edit",
  "sales.payments",
  "sales.return",
  "sales.return.damaged",
  "sales.view",
  "settings.access",
  "settings.backup",
  "settings.general",
  "settings.landing",
  "showrooms.manage",
  "showrooms.view",
  "transfers.damaged.create",
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number];

/**
 * Route path -> the `anyOf` set that gates it. Keep in sync with the
 * `PermissionGate` usage in `src/routes/_authenticated/*` (a test enforces it).
 */
export const ROUTE_GUARDS: Record<string, string[]> = {
  // Production module + its reports
  "/production": ["production.reports.daily_register", "production.reports.view"],
  "/production/factory-stock": ["production.access", "inventory.view"],
  "/production/cost-report": ["production.reports.cost", "production.reports.view"],
  "/production/consumption-report": ["production.reports.consumption", "production.reports.view"],
  "/production/overhead-report": ["production.reports.overhead", "production.reports.view"],
  "/production/profit-loss": ["production.reports.profit_loss", "production.reports.view"],
  "/production/wastage": ["production.wastage.manage", "production.repurpose"],
  "/recipes": ["production.recipes.view", "production.access"],
  "/sub-recipes": ["production.recipes.view", "production.access"],
  "/raw-materials": ["production.raw_materials.view", "production.access"],
  "/raw-material-stock": ["production.raw_materials.view", "production.access"],

  // Reports section
  "/reports/stock": ["reports.stock"],
  "/reports/sales": ["reports.sales"],
  "/reports/purchase": ["reports.purchase"],
  "/reports/ledgers": ["reports.ledgers"],
  "/reports/expenses": ["reports.expenses"],
  "/expenses/report": ["reports.expenses", "expenses.view"],

  // Inventory movement
  "/transfers": ["inventory.transfer", "inventory.receive", "inventory.damaged_return"],
  "/transfers/new": ["inventory.transfer"],
  "/transfers/damaged/new": ["inventory.damaged_return", "inventory.transfer"],

  // Operations
  "/pos": ["pos.access"],
  "/dashboard": ["dashboard.access"],
  "/ai-insights": ["dashboard.access"],
  "/inventory": ["inventory.view"],
  "/product-stock": ["inventory.view", "inventory.adjust"],
  "/catalog": ["products.view"],
  "/orders": ["sales.view"],
  "/accounting": ["reports.ledgers", "reports.sales"],
  "/reports": ["reports.stock", "reports.sales", "reports.purchase", "reports.ledgers", "reports.expenses"],
  "/purchasing": ["purchases.view", "purchases.create", "purchases.return", "purchases.payments"],
  "/sales": ["sales.view", "sales.create", "sales.return", "sales.payments"],
  "/products": [
    "products.view",
    "products.categories.manage",
    "products.units.manage",
    "products.selling_prices.manage",
  ],
  "/expenses": ["expenses.view", "expenses.manage", "expenses.categories.manage", "reports.expenses"],

  // Contacts + settings
  "/crm": ["contacts.customers.view", "contacts.customers.manage", "contacts.customers.ledger"],
  "/crm/:id/ledger": ["contacts.customers.ledger", "contacts.customers.view"],
  "/suppliers": ["contacts.suppliers.view", "contacts.suppliers.manage"],
  "/branches": ["showrooms.view", "showrooms.manage"],
  "/employees": ["employees.view", "employees.manage"],
  "/settings": ["settings.general"],
  "/settings/showrooms": ["showrooms.view", "showrooms.manage"],
  "/settings/access": ["settings.access"],
  "/settings/landing": ["settings.landing"],
};


/** Routes whose only purpose is reporting — used for report-coverage assertions. */
export const REPORT_ROUTES = [
  "/production",
  "/production/cost-report",
  "/production/consumption-report",
  "/production/overhead-report",
  "/production/profit-loss",
  "/reports/stock",
  "/reports/sales",
  "/reports/purchase",
  "/reports/ledgers",
  "/reports/expenses",
  "/expenses/report",
] as const;

/**
 * Database functions guarded by `public.assert_app_staff()` — callable only by
 * a signed-in user who holds at least one role, never by anon.
 */
export const STAFF_ONLY_RPCS = [
  "commit_stock_movement",
  "commit_raw_stock_movement",
  "commit_production_batch",
  "commit_damaged_movement",
  "commit_damaged_sale",
  "commit_damaged_transfer_approve",
  "commit_repurpose",
  "log_finished_product_wastage",
] as const;

export const SUPERADMIN = "Superadmin";

/**
 * Intended permission sets for the built-in roles. `Superadmin` bypasses every
 * check and therefore holds no explicit rows.
 */
export const ROLE_MATRIX: Record<string, string[]> = {
  [SUPERADMIN]: [],
  Admin: PERMISSION_CATALOG.filter((k) => k !== "settings.access"),
  Manager: [
    "dashboard.access",
    "pos.access",
    "pos.discount",
    "sales.view",
    "sales.create",
    "sales.edit",
    "sales.return",
    "sales.payments",
    "contacts.customers.view",
    "contacts.customers.manage",
    "contacts.customers.ledger",
    
    "contacts.suppliers.view",
    "products.view",
    "products.create",
    "products.edit",
    "products.categories.manage",
    "products.units.manage",
    "products.selling_prices.manage",
    "inventory.view",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.receive",
    "inventory.damaged_return",
    "transfers.damaged.create",
    "production.access",
    "production.batches",
    "production.recipes.view",
    "production.recipes.manage",
    "production.sub_recipes.manage",
    "production.raw_materials.view",
    "production.raw_materials.manage",
    "production.overheads.manage",
    "production.wastage.manage",
    "production.repurpose",
    "production.damaged.sell",
    "production.labels.print",
    "production.factory_stock.view",
    "production.reports.view",
    "production.reports.daily_register",
    "production.reports.cost",
    "production.reports.consumption",
    "production.reports.overhead",
    "production.reports.profit_loss",
    "purchases.view",
    "purchases.create",
    "purchases.edit",
    "purchases.return",
    "purchases.payments",
    "expenses.view",
    "expenses.manage",
    "expenses.categories.manage",
    "reports.stock",
    "reports.sales",
    "reports.purchase",
    "reports.ledgers",
    "reports.expenses",
    "employees.view",
    "showrooms.view",
  ],
  Cashier: [
    "dashboard.access",
    "pos.access",
    "sales.view",
    "sales.create",
    "sales.payments",
    "contacts.customers.view",
    "contacts.customers.manage",
    "products.view",
    "inventory.view",
  ],
};

export type EffectivePermissions = {
  isSuperadmin: boolean;
  /** Permissions granted with no showroom scope. */
  global: Set<string>;
  /** Permissions granted only inside a specific showroom. */
  scoped?: Map<string, Set<string>>;
};

/**
 * Mirrors the runtime check used by `PermissionGate` and the sidebar: a user
 * passes when they are Superadmin or hold ANY of the listed keys, globally or
 * in any scoped showroom.
 */
export function hasAnyPermission(perms: EffectivePermissions, anyOf: string[]): boolean {
  if (perms.isSuperadmin) return true;
  for (const key of anyOf) {
    if (perms.global.has(key)) return true;
    for (const set of perms.scoped?.values() ?? []) if (set.has(key)) return true;
  }
  return false;
}

/** Build an `EffectivePermissions` value for one of the built-in roles. */
export function permissionsForRole(role: string): EffectivePermissions {
  return {
    isSuperadmin: role === SUPERADMIN,
    global: new Set(ROLE_MATRIX[role] ?? []),
    scoped: new Map(),
  };
}

/** Whether a role should be able to open a guarded route. */
export function roleCanAccessRoute(role: string, route: string): boolean {
  const guard = ROUTE_GUARDS[route];
  if (!guard) throw new Error(`Unknown guarded route: ${route}`);
  return hasAnyPermission(permissionsForRole(role), guard);
}
