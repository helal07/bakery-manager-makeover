import { describe, expect, it } from "vitest";
import {
  auditActionLabel, auditDiffRows, auditTableLabel, formatAuditValue,
  type AuditEntry,
} from "@/lib/audit-log-store";

const base: AuditEntry = {
  id: "1", occurred_at: new Date().toISOString(), actor_id: "u1",
  actor_email: "a@b.com", action: "update", table_name: "products",
  record_id: "p1", showroom_id: null, changed_fields: null,
  old_data: null, new_data: null, note: null,
};

describe("audit log helpers", () => {
  it("uses changed_fields for the diff when present", () => {
    const rows = auditDiffRows({
      ...base,
      changed_fields: ["price"],
      old_data: { id: "p1", price: 10, name: "Bun" },
      new_data: { id: "p1", price: 12, name: "Bun" },
    });
    expect(rows).toEqual([{ field: "price", before: "10", after: "12" }]);
  });

  it("falls back to all keys and hides timestamps for inserts", () => {
    const rows = auditDiffRows({
      ...base,
      action: "insert",
      new_data: { id: "p1", name: "Bun", created_at: "x", updated_at: "y" },
    });
    expect(rows.map((r) => r.field).sort()).toEqual(["id", "name"]);
    expect(rows.find((r) => r.field === "name")!.before).toBe("—");
  });

  it("formats empty and object values", () => {
    expect(formatAuditValue(null)).toBe("—");
    expect(formatAuditValue("")).toBe("—");
    expect(formatAuditValue({ a: 1 })).toBe('{"a":1}');
    expect(formatAuditValue(0)).toBe("0");
  });

  it("labels actions and modules for humans", () => {
    expect(auditActionLabel("delete")).toBe("Deleted");
    expect(auditActionLabel("login")).toBe("Signed in");
    expect(auditTableLabel("sale_returns")).toBe("Sale returns");
    expect(auditTableLabel(null)).toBe("—");
    expect(auditTableLabel("unknown_table")).toBe("unknown_table");
  });
});
