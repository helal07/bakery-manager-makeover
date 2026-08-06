import { describe, it, expect } from "vitest";
import { saleSubtotal, saleTotals, outstandingDue, phoneKey, paymentModeFor } from "@/lib/sale-math";

describe("sale totals", () => {
  it("sums line items", () => {
    expect(saleSubtotal([{ price: 25.5, qty: 3 }, { price: 10, qty: 2 }])).toBe(96.5);
    expect(saleSubtotal([])).toBe(0);
  });

  it("applies discount, tax and shipping", () => {
    const t = saleTotals({
      lines: [{ price: 100, qty: 2 }],
      discount: 25,
      tax: 10,
      shipping: 15,
      paid: 100,
    });
    expect(t.subtotal).toBe(200);
    expect(t.total).toBe(200);
    expect(t.due).toBe(100);
    expect(t.change).toBe(0);
  });

  it("reports change instead of negative due on overpayment", () => {
    const t = saleTotals({ lines: [{ price: 90, qty: 1 }], paid: 100 });
    expect(t.due).toBe(-10);
    expect(t.change).toBe(10);
  });

  it("rounds to 2 decimals", () => {
    const t = saleTotals({ lines: [{ price: 33.333, qty: 3 }], paid: 0 });
    expect(t.subtotal).toBe(100);
    expect(t.total).toBe(100);
  });

  it("treats missing numbers as zero", () => {
    const t = saleTotals({ lines: [{ price: Number.NaN, qty: 2 }] });
    expect(t.total).toBe(0);
    expect(t.due).toBe(0);
  });
});

describe("payment mode mapping", () => {
  it("maps UI modes to stored values", () => {
    expect(paymentModeFor("cash", 0)).toBe("cash");
    expect(paymentModeFor("card", 0)).toBe("card");
    expect(paymentModeFor("credit", 500)).toBe("due");
    expect(paymentModeFor("multi", 500)).toBe("partial");
    expect(paymentModeFor("multi", 0)).toBe("cash");
  });
});

describe("outstanding due", () => {
  const sales = [
    { due: 500, customer_id: "c1", customer_phone: "01711-000111" },
    { due: 300, customer_id: null, customer_phone: "01711 000111" },
    { due: 900, customer_id: "c2", customer_phone: "01999-000222" },
  ];

  it("normalises phone numbers the same way the database does", () => {
    expect(phoneKey("+880 1711-000111")).toBe("8801711000111");
    expect(phoneKey(null)).toBe("");
  });

  it("matches by customer id or phone", () => {
    expect(outstandingDue(sales, [], { customerId: "c1" })).toBe(500);
    // c1's own sale plus a walk-in sale recorded against the same digits
    expect(outstandingDue(sales, [], { customerId: "c1", phone: "01711-000111" })).toBe(800);
    expect(outstandingDue(sales, [], { phone: "+880 1711 000111" })).toBe(0);

    expect(outstandingDue(sales, [], { customerId: "c2" })).toBe(900);
  });

  it("subtracts standalone payments and never goes negative", () => {
    expect(outstandingDue(sales, [{ amount: 200 }], { customerId: "c1" })).toBe(300);
    expect(outstandingDue(sales, [{ amount: 5000 }], { customerId: "c1" })).toBe(0);
  });

  it("returns zero with no match criteria", () => {
    expect(outstandingDue(sales, [], {})).toBe(0);
  });
});
