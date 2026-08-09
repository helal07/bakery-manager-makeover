import { describe, it, expect } from "vitest";
import { buildLedger, summarize, filterByRange } from "./ledger-math";

describe("ledger-math", () => {
  const invoices = [
    { id: "f5f7001d", date: "2026-07-19T14:00:33Z", total: 1400, paid: 1000, showroom_id: null },
    { id: "eb6c79a4", date: "2026-07-19T14:50:42Z", total: 75, paid: 50, showroom_id: null },
    { id: "1fcdcf11", date: "2026-07-19T14:55:45Z", total: 15, paid: 10, showroom_id: null },
  ];
  const payments = [
    { id: "23194fba", date: "2026-07-18", amount: 1000, method: "Card", invoice_id: "f5f7001d", showroom_id: null },
  ];

  it("counts an invoice-linked payment only once", () => {
    const entries = buildLedger({ kind: "customer", invoices, payments });
    const s = summarize(entries);
    expect(s.totalInvoice).toBe(1490);
    expect(s.totalPaid).toBe(1060);
    expect(s.balanceDue).toBe(430);
    expect(s.advance).toBe(0);
  });

  it("credits the residual of paid when no payment row exists", () => {
    const entries = buildLedger({ kind: "customer", invoices: [invoices[1]], payments: [] });
    expect(summarize(entries).totalPaid).toBe(50);
  });

  it("marks statuses and closing balance", () => {
    const entries = buildLedger({ kind: "customer", invoices, payments });
    const sells = entries.filter((e) => e.type === "Sell");
    expect(sells.every((e) => e.status === "Partial")).toBe(true);
    expect(entries[entries.length - 1].balance).toBe(430);
  });

  it("treats returns as credit", () => {
    const entries = buildLedger({
      kind: "customer",
      invoices: [invoices[2]],
      payments: [],
      returns: [{ id: "r1", date: "2026-07-20", amount: 5 }],
    });
    expect(summarize(entries).balanceDue).toBe(0);
  });

  it("filters by date range", () => {
    const entries = buildLedger({ kind: "customer", invoices, payments });
    expect(filterByRange(entries, "2026-07-19", "2026-07-19").length).toBe(entries.length - 1);
  });

  it("supplier ledger nets purchases the same way", () => {
    const entries = buildLedger({
      kind: "supplier",
      invoices: [{ id: "p1", code: "PO-1", date: "2026-07-01", total: 500, paid: 200 }],
      payments: [{ id: "sp1", date: "2026-07-02", amount: 200, invoice_id: "p1", method: "Cash" }],
    });
    expect(entries.filter((e) => e.type === "Purchase")).toHaveLength(1);
    expect(summarize(entries).balanceDue).toBe(300);
  });
});
