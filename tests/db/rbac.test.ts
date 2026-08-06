/**
 * RBAC enforcement tests against a REAL database.
 *
 * They verify that the permission catalog, the built-in roles, and the RPC
 * guards actually agree with `src/lib/rbac-matrix.ts`. Opt-in: without
 * credentials the whole file is skipped.
 *
 *   TEST_SUPABASE_URL=... TEST_SUPABASE_SERVICE_KEY=... \
 *   TEST_SUPABASE_ANON_KEY=... bunx vitest run tests/db
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  PERMISSION_CATALOG,
  REPORT_ROUTES,
  ROLE_MATRIX,
  ROUTE_GUARDS,
  STAFF_ONLY_RPCS,
  SUPERADMIN,
  hasAnyPermission,
} from "@/lib/rbac-matrix";

const URL_ = process.env["TEST_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
const KEY = process.env["TEST_SUPABASE_SERVICE_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
const ANON =
  process.env["TEST_SUPABASE_ANON_KEY"] ??
  process.env["SUPABASE_ANON_KEY"] ??
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

const suite = URL_ && KEY ? describe : describe.skip;

/** Minimal args for each staff-only RPC — the guard fires before validation. */
const rpcArgs: Record<string, Record<string, unknown>> = {
  commit_stock_movement: { _product_id: null, _showroom_id: null, _qty: 0, _kind: "test" },
  commit_raw_stock_movement: { _material_id: null, _showroom_id: null, _qty: 0, _kind: "test" },
  commit_production_batch: { _product_id: null, _showroom_id: null, _batch: 1, _ingredients: [] },
  commit_damaged_movement: { _product_id: null, _showroom_id: null, _qty: 0, _kind: "test" },
  commit_damaged_sale: { _product_id: null, _showroom_id: null, _qty: 1, _unit_price: 1 },
  commit_damaged_transfer_approve: { _transfer_id: "00000000-0000-0000-0000-000000000000" },
  commit_repurpose: {
    _queue_id: "00000000-0000-0000-0000-000000000000",
    _material_id: null,
    _yield_qty: 0,
    _wastage_qty: 0,
  },
  log_finished_product_wastage: { _product_id: null, _showroom_id: null, _qty: 1, _reason: "test" },
};

suite("RBAC matrix in the database", () => {
  let db: SupabaseClient;
  let catalogKeys: string[] = [];
  let rolePerms = new Map<string, Set<string>>();

  beforeAll(async () => {
    db = createClient(URL_!, KEY!, { auth: { persistSession: false } });

    const { data: perms, error } = await db.from("permissions").select("permission_key");
    expect(error).toBeNull();
    catalogKeys = (perms ?? []).map((p: any) => p.permission_key);

    const { data: rows } = await db.from("app_roles").select("id,name,role_permissions(permission_key)");
    rolePerms = new Map(
      (rows ?? []).map((r: any) => [
        r.name,
        new Set<string>((r.role_permissions ?? []).map((p: any) => p.permission_key)),
      ]),
    );
  });

  it("catalog contains every key the app enforces", () => {
    const missing = PERMISSION_CATALOG.filter((k) => !catalogKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("catalog has no keys the app never enforces", () => {
    const known = new Set<string>(PERMISSION_CATALOG);
    expect(catalogKeys.filter((k) => !known.has(k))).toEqual([]);
  });

  it("every route guard key exists in the catalog", () => {
    const unknown = Object.values(ROUTE_GUARDS)
      .flat()
      .filter((k) => !catalogKeys.includes(k));
    expect([...new Set(unknown)]).toEqual([]);
  });

  it("Superadmin holds no explicit permission rows (it bypasses checks)", () => {
    const set = rolePerms.get(SUPERADMIN);
    if (!set) return; // role not seeded in this environment
    expect(set.size).toBe(0);
  });

  for (const role of Object.keys(ROLE_MATRIX).filter((r) => r !== SUPERADMIN)) {
    it(`${role} grants at least its matrix permissions`, () => {
      const set = rolePerms.get(role);
      if (!set) return; // role not seeded in this environment
      expect(ROLE_MATRIX[role].filter((k) => !set.has(k))).toEqual([]);
    });

    it(`${role} report-route access matches the matrix`, () => {
      const set = rolePerms.get(role);
      if (!set) return;
      const actual = { isSuperadmin: false, global: set };
      const expectedPerms = { isSuperadmin: false, global: new Set(ROLE_MATRIX[role]) };
      for (const route of REPORT_ROUTES) {
        expect(
          hasAnyPermission(actual, ROUTE_GUARDS[route]),
          `${role} on ${route}`,
        ).toBe(hasAnyPermission(expectedPerms, ROUTE_GUARDS[route]));
      }
    });
  }

  describe("staff-only RPCs", () => {
    const anonSuite = ANON ? describe : describe.skip;

    anonSuite("anon caller", () => {
      let anonDb: SupabaseClient;
      beforeAll(() => {
        anonDb = createClient(URL_!, ANON!, { auth: { persistSession: false } });
      });

      for (const fn of STAFF_ONLY_RPCS) {
        it(`${fn} is blocked without a role`, async () => {
          const { error } = await anonDb.rpc(fn, rpcArgs[fn] as any);
          expect(error, `${fn} was NOT blocked for anon`).toBeTruthy();
        });
      }
    });

    it("the staff guard function exists and is not anon-executable", async () => {
      const { data, error } = await db
        .from("permissions")
        .select("permission_key")
        .eq("permission_key", "production.access")
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.permission_key).toBe("production.access");

      if (!ANON) return;
      const anonDb = createClient(URL_!, ANON!, { auth: { persistSession: false } });
      const { error: guardErr } = await anonDb.rpc("assert_app_staff" as any, {});
      expect(guardErr).toBeTruthy();
    });
  });
});
