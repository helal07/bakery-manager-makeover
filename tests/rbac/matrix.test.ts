/**
 * RBAC matrix tests (no database required).
 *
 * These prove three things:
 *  1. Every guarded route in the codebase matches `ROUTE_GUARDS`, so the matrix
 *     used by the DB tests can never silently drift from the app.
 *  2. Every built-in role is allowed/blocked on every report route exactly as
 *     the matrix says.
 *  3. Sidebar visibility never offers a link the role cannot actually open.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PERMISSION_CATALOG,
  REPORT_ROUTES,
  ROUTE_GUARDS,
  ROLE_MATRIX,
  SUPERADMIN,
  hasAnyPermission,
  permissionsForRole,
  roleCanAccessRoute,
} from "@/lib/rbac-matrix";

const ROUTES_DIR = join(process.cwd(), "src", "routes", "_authenticated");
const catalog = new Set<string>(PERMISSION_CATALOG);
const roles = Object.keys(ROLE_MATRIX);

/** Read `PermissionGate anyOf={[...]}` plus the route path from each route file. */
function declaredGuards() {
  const out: { file: string; path: string; anyOf: string[] }[] = [];
  for (const file of readdirSync(ROUTES_DIR)) {
    if (!file.endsWith(".tsx")) continue;
    const src = readFileSync(join(ROUTES_DIR, file), "utf8");
    const gate = src.match(/anyOf=\{\[([^\]]*)\]\}/s);
    if (!gate) continue;
    const anyOf = [...gate[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const route = src.match(/createFileRoute\("([^"]+)"\)/);
    const path = (route?.[1] ?? "")
      .replace("/_authenticated", "")
      .replace(/\$(\w+)/g, ":$1")
      .replace(/\/$/, "");
    out.push({ file, path: path || "/", anyOf });
  }
  return out;
}

const guards = declaredGuards();

describe("permission keys", () => {
  it("every guarded route uses keys from the catalog", () => {
    const unknown = guards.flatMap((g) => g.anyOf.filter((k) => !catalog.has(k)).map((k) => `${g.file}: ${k}`));
    expect(unknown).toEqual([]);
  });

  it("every sidebar permission uses keys from the catalog", () => {
    const shell = readFileSync(join(process.cwd(), "src", "components", "app-shell.tsx"), "utf8");
    const keys = [...shell.matchAll(/permission:\s*(?:"([^"]+)"|\[([^\]]*)\])/g)].flatMap((m) =>
      m[1] ? [m[1]] : [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
    );
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => !catalog.has(k))).toEqual([]);
  });

  it("every role in the matrix only grants catalog keys", () => {
    for (const role of roles) {
      expect(ROLE_MATRIX[role].filter((k) => !catalog.has(k))).toEqual([]);
    }
  });
});

describe("route guards match the code", () => {
  it("every route in ROUTE_GUARDS is actually gated with the same keys", () => {
    for (const [path, expected] of Object.entries(ROUTE_GUARDS)) {
      // A path can be gated by both an index route and its parent layout;
      // any one of them must match the matrix exactly.
      const candidates = guards.filter((g) => g.path === path);
      expect(candidates.length, `no PermissionGate found for ${path}`).toBeGreaterThan(0);
      expect(
        candidates.map((c) => c.anyOf),
        `guard drift on ${path}`,
      ).toContainEqual(expected);
    }
  });

  it("every report route is gated", () => {
    for (const path of REPORT_ROUTES) {
      expect(ROUTE_GUARDS[path], `${path} is ungated`).toBeTruthy();
      expect(ROUTE_GUARDS[path].length).toBeGreaterThan(0);
    }
  });

  it("no guarded route file is missing from ROUTE_GUARDS", () => {
    // Pages under a gated parent layout (e.g. /production/*) are allowed to be
    // absent only if the parent gate is registered.
    const missing = guards
      .filter((g) => !ROUTE_GUARDS[g.path])
      .filter((g) => !Object.keys(ROUTE_GUARDS).some((p) => p !== "/" && g.path.startsWith(`${p}/`)))
      .map((g) => `${g.file} (${g.path})`);
    expect(missing).toEqual([]);
  });
});

describe("role x report route access", () => {
  // Explicit expectations: true = must be allowed, false = must be blocked.
  const expected: Record<string, Record<string, boolean>> = {
    [SUPERADMIN]: Object.fromEntries(REPORT_ROUTES.map((r) => [r, true])),
    Admin: Object.fromEntries(REPORT_ROUTES.map((r) => [r, true])),
    Manager: Object.fromEntries(REPORT_ROUTES.map((r) => [r, true])),
    Cashier: Object.fromEntries(REPORT_ROUTES.map((r) => [r, false])),
  };

  for (const role of roles) {
    for (const route of REPORT_ROUTES) {
      it(`${role} is ${expected[role][route] ? "allowed" : "blocked"} on ${route}`, () => {
        expect(roleCanAccessRoute(role, route)).toBe(expected[role][route]);
      });
    }
  }
});

describe("role x sensitive route access", () => {
  const cases: [string, string, boolean][] = [
    ["Admin", "/settings/access", false],
    [SUPERADMIN, "/settings/access", true],
    ["Manager", "/settings/access", false],
    ["Cashier", "/settings/access", false],
    ["Manager", "/settings", false],
    ["Cashier", "/settings", false],
    ["Cashier", "/transfers", false],
    ["Manager", "/transfers", true],
    ["Manager", "/transfers/damaged/new", true],
    ["Cashier", "/production/wastage", false],
    ["Cashier", "/recipes", false],
    ["Manager", "/recipes", true],
    // The ledger gate also accepts plain customer view, which a cashier holds.
    ["Cashier", "/crm/:id/ledger", true],
    ["Manager", "/crm/:id/ledger", true],
    ["Cashier", "/employees", false],
  ];

  for (const [role, route, allowed] of cases) {
    it(`${role} is ${allowed ? "allowed" : "blocked"} on ${route}`, () => {
      expect(roleCanAccessRoute(role, route)).toBe(allowed);
    });
  }

  it("a role with only one report permission sees only that report", () => {
    const perms = { isSuperadmin: false, global: new Set(["production.reports.cost"]) };
    expect(hasAnyPermission(perms, ROUTE_GUARDS["/production/cost-report"])).toBe(true);
    expect(hasAnyPermission(perms, ROUTE_GUARDS["/production/profit-loss"])).toBe(false);
    expect(hasAnyPermission(perms, ROUTE_GUARDS["/reports/sales"])).toBe(false);
  });

  it("a showroom-scoped grant still opens the route", () => {
    const perms = {
      isSuperadmin: false,
      global: new Set<string>(),
      scoped: new Map([["showroom-1", new Set(["reports.sales"])]]),
    };
    expect(hasAnyPermission(perms, ROUTE_GUARDS["/reports/sales"])).toBe(true);
    expect(hasAnyPermission(perms, ROUTE_GUARDS["/reports/stock"])).toBe(false);
  });
});

describe("sidebar visibility never dead-ends", () => {
  const shell = readFileSync(join(process.cwd(), "src", "components", "app-shell.tsx"), "utf8");
  const items = [...shell.matchAll(/to:\s*"([^"]+)"[^}]*?permission:\s*(?:"([^"]+)"|\[([^\]]*)\])/g)].map((m) => ({
    to: m[1],
    keys: m[2] ? [m[2]] : [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
  }));

  it("parsed some nav items", () => {
    expect(items.length).toBeGreaterThan(20);
  });

  for (const role of roles) {
    it(`${role}: every visible link is openable`, () => {
      const perms = permissionsForRole(role);
      const broken = items
        .filter((i) => ROUTE_GUARDS[i.to])
        .filter((i) => hasAnyPermission(perms, i.keys) && !hasAnyPermission(perms, ROUTE_GUARDS[i.to]))
        .map((i) => i.to);
      expect(broken).toEqual([]);
    });
  }
});
