import { describe, it, expect } from "vitest";
import { BACKUP_TABLES } from "@/lib/backup-tables";

/**
 * Parent -> children. A table may only be restored after every parent it
 * references, and deleted before them. Kept in sync with the FKs in sql/.
 */
const PARENTS: Record<string, string[]> = {
  role_permissions: ["app_roles"],
  user_role_assignments: ["app_roles", "showrooms"],
  employees: ["app_roles", "showrooms"],
  customers: ["customer_groups"],
  customer_groups: ["selling_price_groups"],
  products: ["product_categories"],
  product_selling_prices: ["products", "selling_price_groups"],
  product_stock: ["products", "showrooms"],
  raw_material_stock: ["raw_materials", "showrooms"],
  sub_recipe_items: ["sub_recipes", "raw_materials"],
  recipes: ["products", "raw_materials", "recipe_categories", "sub_recipes"],
  recipe_overheads: ["products", "production_overhead_categories"],
  production_overheads: ["products", "production_overhead_categories"],
  expenses: ["expense_categories", "showrooms"],
  purchases: ["suppliers", "purchase_categories", "showrooms"],
  purchase_items: ["purchases", "raw_materials", "products"],
  purchase_returns: ["purchases", "suppliers", "showrooms"],
  purchase_return_items: ["purchase_returns", "raw_materials", "products"],
  supplier_payments: ["suppliers", "purchases", "showrooms"],
  cash_registers: ["showrooms"],
  sales: ["customers", "cash_registers", "showrooms"],
  sale_items: ["sales", "products"],
  sale_payments: ["sales"],
  sale_returns: ["sales", "showrooms"],
  sale_return_items: ["sale_returns", "sale_items", "products"],
  customer_payments: ["customers", "sales", "showrooms"],
  held_sales: ["customers", "showrooms"],
  orders: ["customers", "showrooms"],
  transfers: ["showrooms"],
  transfer_items: ["transfers", "products", "raw_materials"],
  stock_ledger: ["products", "showrooms"],
  raw_stock_ledger: ["raw_materials", "showrooms"],
  damaged_stock: ["products", "showrooms"],
  damaged_ledger: ["products", "showrooms"],
  repurpose_queue: ["products", "showrooms", "transfers", "raw_materials"],
  wastage_log: ["products", "raw_materials", "showrooms"],
  work_orders: ["products", "showrooms"],
  qc_checks: ["products", "showrooms"],
};

describe("BACKUP_TABLES ordering", () => {
  const index = new Map(BACKUP_TABLES.map((t, i) => [t as string, i]));

  it("has no duplicates", () => {
    expect(new Set(BACKUP_TABLES).size).toBe(BACKUP_TABLES.length);
  });

  it("lists every parent before its child (restore order is FK-safe)", () => {
    const violations: string[] = [];
    for (const [child, parents] of Object.entries(PARENTS)) {
      const ci = index.get(child);
      expect(ci, `${child} missing from BACKUP_TABLES`).toBeDefined();
      for (const parent of parents) {
        const pi = index.get(parent);
        expect(pi, `${parent} missing from BACKUP_TABLES`).toBeDefined();
        if (pi! > ci!) violations.push(`${parent} (${pi}) must come before ${child} (${ci})`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("deletes children before parents when reversed", () => {
    const reversed = [...BACKUP_TABLES].reverse();
    const ri = new Map(reversed.map((t, i) => [t as string, i]));
    for (const [child, parents] of Object.entries(PARENTS)) {
      for (const parent of parents) {
        expect(ri.get(child)!, `${child} must be deleted before ${parent}`).toBeLessThan(ri.get(parent)!);
      }
    }
  });

  it("covers the tables referenced by the FK map", () => {
    const referenced = new Set(Object.entries(PARENTS).flatMap(([c, p]) => [c, ...p]));
    for (const t of referenced) expect(index.has(t), `${t} not backed up`).toBe(true);
  });
});
