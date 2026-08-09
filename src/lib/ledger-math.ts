/**
 * Pure ledger arithmetic for customer & supplier statements.
 *
 * The important rule: money is counted ONCE. An invoice's `paid` column and a
 * payment row linked to that invoice describe the same cash, so the payment
 * rows win and only the uncovered residual of `paid` is credited as an
 * "inline" payment (legacy invoices saved without a payment row).
 */

export const round2 = (n: number) => +(Number(n) || 0).toFixed(2);

export type LedgerType = "Sell" | "Purchase" | "Payment" | "Return";

export type LedgerEntry = {
  date: string;
  ref: string;
  refId?: string;
  type: LedgerType;
  location: string | null;
  status: "Paid" | "Partial" | "Due" | "";
  debit: number;
  credit: number;
  method: string;
  others: string;
  balance: number;
};

export type InvoiceRow = {
  id: string;
  code?: string | null;
  date: string;
  total: number;
  paid: number;
  showroom_id?: string | null;
};

export type PaymentRow = {
  id: string;
  date: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  invoice_id?: string | null;
  showroom_id?: string | null;
};

export type ReturnRow = {
  id: string;
  code?: string | null;
  date: string;
  amount: number;
  invoice_id?: string | null;
  reason?: string | null;
  showroom_id?: string | null;
};

export function invoiceStatus(total: number, credited: number): "Paid" | "Partial" | "Due" {
  if (credited <= 0) return "Due";
  if (round2(credited) >= round2(total)) return "Paid";
  return "Partial";
}

export const shortRef = (id: string) => id.slice(0, 8).toUpperCase();

/**
 * Build a running-balance statement.
 * `kind` decides whether invoices are sales ("Sell") or purchases ("Purchase").
 */
export function buildLedger(input: {
  kind: "customer" | "supplier";
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  returns?: ReturnRow[];
  locationName?: (id: string | null | undefined) => string;
}): LedgerEntry[] {
  const { invoices, payments } = input;
  const returns = input.returns ?? [];
  const loc = input.locationName ?? ((id) => (id ? id : "Factory"));
  const invType: LedgerType = input.kind === "customer" ? "Sell" : "Purchase";

  // How much of each invoice is already covered by explicit payment rows.
  const linked = new Map<string, number>();
  for (const p of payments) {
    if (!p.invoice_id) continue;
    linked.set(p.invoice_id, round2((linked.get(p.invoice_id) ?? 0) + (Number(p.amount) || 0)));
  }

  type Raw = Omit<LedgerEntry, "balance">;
  const raw: Raw[] = [];

  for (const inv of invoices) {
    const total = round2(inv.total);
    const paid = round2(inv.paid);
    const covered = linked.get(inv.id) ?? 0;
    const residual = round2(Math.max(0, paid - covered));

    raw.push({
      date: inv.date,
      ref: inv.code || shortRef(inv.id),
      refId: inv.id,
      type: invType,
      location: loc(inv.showroom_id),
      status: invoiceStatus(total, Math.max(paid, covered)),
      debit: total,
      credit: 0,
      method: "",
      others: "",
    });

    if (residual > 0) {
      raw.push({
        date: inv.date,
        ref: inv.code || shortRef(inv.id),
        refId: inv.id,
        type: "Payment",
        location: loc(inv.showroom_id),
        status: "",
        debit: 0,
        credit: residual,
        method: "",
        others: "Paid with invoice",
      });
    }
  }

  for (const p of payments) {
    raw.push({
      date: p.date,
      ref: p.reference || shortRef(p.id),
      refId: p.invoice_id ?? undefined,
      type: "Payment",
      location: loc(p.showroom_id),
      status: "",
      debit: 0,
      credit: round2(p.amount),
      method: p.method ?? "",
      others: p.note ?? "",
    });
  }

  for (const r of returns) {
    raw.push({
      date: r.date,
      ref: r.code || shortRef(r.id),
      refId: r.invoice_id ?? undefined,
      type: "Return",
      location: loc(r.showroom_id),
      status: "",
      debit: 0,
      credit: round2(r.amount),
      method: "",
      others: r.reason ?? "",
    });
  }

  raw.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let bal = 0;
  return raw.map((e) => {
    bal = round2(bal + e.debit - e.credit);
    return { ...e, balance: bal };
  });
}

export type LedgerSummary = {
  totalInvoice: number;
  totalPaid: number;
  balanceDue: number;
  advance: number;
  invoiceCount: number;
};

export function summarize(entries: LedgerEntry[]): LedgerSummary {
  let totalInvoice = 0;
  let totalPaid = 0;
  let invoiceCount = 0;
  for (const e of entries) {
    totalInvoice = round2(totalInvoice + e.debit);
    totalPaid = round2(totalPaid + e.credit);
    if (e.type === "Sell" || e.type === "Purchase") invoiceCount += 1;
  }
  const net = round2(totalInvoice - totalPaid);
  return {
    totalInvoice,
    totalPaid,
    balanceDue: Math.max(0, net),
    advance: net < 0 ? -net : 0,
    invoiceCount,
  };
}

export function filterByRange(entries: LedgerEntry[], from?: string, to?: string): LedgerEntry[] {
  return entries.filter((e) => {
    const d = String(e.date).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}
