/**
 * Pure sale/invoice arithmetic. Extracted from the POS screen so the money
 * math can be unit-tested without rendering anything.
 */

export type SaleLine = { price: number; qty: number };

export const round2 = (n: number) => +(Number(n) || 0).toFixed(2);

export function saleSubtotal(lines: SaleLine[]): number {
  return round2(lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0));
}

export function saleTotals(input: {
  lines: SaleLine[];
  discount?: number;
  tax?: number;
  shipping?: number;
  paid?: number;
}) {
  const subtotal = saleSubtotal(input.lines);
  const discount = round2(input.discount ?? 0);
  const tax = round2(input.tax ?? 0);
  const shipping = round2(input.shipping ?? 0);
  const total = round2(subtotal - discount + tax + shipping);
  const paid = round2(input.paid ?? 0);
  const due = round2(total - paid);
  return { subtotal, discount, tax, shipping, total, paid, due, change: due < 0 ? -due : 0 };
}

/** Digits-only phone key, matching the SQL `regexp_replace(phone, '\D', '')` logic. */
export const phoneKey = (phone?: string | null) => String(phone ?? "").replace(/\D/g, "");

/**
 * Outstanding balance for a customer: sum of due on their other sales minus
 * standalone (not sale-linked) payments. Never negative.
 */
export function outstandingDue(
  sales: { due: number; customer_id?: string | null; customer_phone?: string | null }[],
  standalonePayments: { amount: number }[] = [],
  match: { customerId?: string | null; phone?: string | null } = {},
): number {
  const key = phoneKey(match.phone);
  const belongs = (r: { customer_id?: string | null; customer_phone?: string | null }) =>
    (!!match.customerId && r.customer_id === match.customerId) ||
    (!!key && phoneKey(r.customer_phone) === key);
  const owed = sales.filter(belongs).reduce((s, r) => s + (Number(r.due) || 0), 0);
  const paid = standalonePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return round2(Math.max(0, owed - paid));
}

export type PaymentMode = "cash" | "card" | "credit" | "multi";

/** Value stored in `sales.payment_mode`. */
export function paymentModeFor(mode: PaymentMode, due: number): "cash" | "card" | "due" | "partial" {
  if (mode === "cash") return "cash";
  if (mode === "card") return "card";
  if (mode === "credit") return "due";
  return due > 0 ? "partial" : "cash";
}
