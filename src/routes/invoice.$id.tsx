import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Share2, Printer } from "lucide-react";
import {
  getCompany, defaultCompany, type CompanySettings,
  getInvoiceSettings, defaultInvoiceSettings, type InvoiceSettings, type PaperSize,
  getCachedCompany, getCachedInvoiceSettings,
} from "@/lib/company-settings";

import { InvoicePreview, type InvoiceSnapshot } from "@/components/invoice-preview";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

const invoiceSearchSchema = z.object({
  c: z.string().optional(),
  d: z.string().optional(),
  b: z.string().optional(),
  i: z.coerce.number().optional(),
  t: z.coerce.number().optional(),
  p: z.coerce.number().optional(),
  ap: z.coerce.number().optional(),
});

export const Route = createFileRoute("/invoice/$id")({
  head: ({ params }) => ({ meta: [{ title: `Invoice #${params.id}` }] }),
  validateSearch: invoiceSearchSchema,
  component: InvoiceView,
});

async function tryItemSelects(saleId: string): Promise<{ data: any[] }> {
  const res = await sb.from("sale_items").select("*").eq("sale_id", saleId);
  if (res.error) return { data: [] };
  const rows: any[] = res.data ?? [];
  if (rows.length === 0) return { data: [] };
  const ids = Array.from(new Set(rows.map((r: any) => r.product_id).filter(Boolean)));
  if (ids.length) {
    const prodRes = await sb.from("products").select("id,name,sku").in("id", ids);
    if (!prodRes.error && prodRes.data) {
      const map = new Map<string, any>(prodRes.data.map((p: any) => [p.id, p]));
      for (const r of rows) {
        const p = map.get(r.product_id);
        if (p) r.products = { name: p.name, sku: p.sku };
      }
    }
  }
  return { data: rows };
}

function phoneDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function sameCustomer(row: any, sale: any, salePhoneDigits: string): boolean {
  if (sale.customer_id && row.customer_id && row.customer_id === sale.customer_id) return true;
  if (!salePhoneDigits) return false;
  const rowPhoneDigits = phoneDigits(row.customer_phone);
  return Boolean(rowPhoneDigits && rowPhoneDigits === salePhoneDigits);
}

async function calculatePreviousDueFrom(sale: any, priorSales: any[], standalonePays: any[]): Promise<number> {
  const salePhone = phoneDigits(sale.customer_phone);
  if (!sale.customer_id && !salePhone) return 0;
  const outstanding = priorSales
    .filter((row: any) => sameCustomer(row, sale, salePhone))
    .reduce((n: number, row: any) => n + Number(row.due || 0), 0);
  const paid = standalonePays
    .filter((row: any) => sameCustomer(row, sale, salePhone))
    .reduce((n: number, row: any) => n + Number(row.amount || 0), 0);
  return Math.max(0, +(outstanding - paid).toFixed(2));
}

function buildSnapshotFromBundle(bundle: any, settings: InvoiceSettings): InvoiceSnapshot | null {
  const sale = bundle?.sale;
  if (!sale) return null;
  const items: any[] = bundle.items ?? [];
  const pays: any[] = bundle.payments ?? [];
  const showroom = bundle.showroom ?? null;
  const total = Number(sale.total || 0);
  const paid = Number(sale.paid || 0);
  const due = Math.max(0, total - paid);
  const mode: "cash" | "due" | "partial" = paid <= 0 ? "due" : paid >= total ? "cash" : "partial";
  const ref = sale.external_ref
    ?? `${settings.numberPrefix}${String(sale.id).slice(0, settings.numberPadding).toUpperCase()}`;
  return {
    customer: {
      name: sale.customer_name ?? "Walk-in Customer",
      phone: sale.customer_phone ?? "",
      address: bundle.customer_address ?? undefined,
    },
    branch: showroom?.name ?? "Factory",
    showroom,
    reference: ref,
    date: sale.created_at ?? new Date().toISOString(),
    mode,
    items: items.map((it: any) => ({
      name: it._p_name ?? it.product_name ?? "Item",
      sku: it._p_sku ?? it.product_sku ?? "",
      price: Number(it.unit_price || 0),
      qty: Number(it.qty || 0),
      discount: 0,
    })),
    subtotal: Number(sale.subtotal ?? total),
    discount: Number(sale.discount ?? 0),
    tax: Number(sale.tax ?? 0),
    shipping: Number(sale.shipping ?? 0),
    total,
    paid,
    due,
    previousDue: Number(bundle.previous_due ?? 0),
    payments: pays.map((p: any) => ({
      method: p.method ?? "cash",
      amount: Number(p.amount || 0),
      reference: p.reference ?? null,
    })),
  };
}

async function fetchSaleSnapshot(id: string, settings: InvoiceSettings): Promise<InvoiceSnapshot | null> {
  // Fast path: single RPC round-trip.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(id)) {
    try {
      const { data, error } = await sb.rpc("get_invoice_bundle", { _sale_id: id });
      if (!error && data) {
        const snap = buildSnapshotFromBundle(data, settings);
        if (snap) return snap;
      }
    } catch { /* fall through to legacy path */ }
  }

  // Legacy fallback: resolve sale, then run all reads in parallel.
  let sale: any = null;
  if (uuidRe.test(id)) {
    const byUuid = await sb.from("sales").select("*").eq("id", id).maybeSingle();
    if (byUuid?.data) sale = byUuid.data;
  }
  if (!sale) {
    const byRef = await sb.from("sales").select("*").eq("external_ref", id).maybeSingle();
    if (byRef?.data) sale = byRef.data;
  }
  if (!sale) return null;

  const salePhone = phoneDigits(sale.customer_phone);
  const custByIdP = sale.customer_id
    ? sb.from("customers").select("address").eq("id", sale.customer_id).maybeSingle()
    : Promise.resolve({ data: null });
  const custByPhoneP = sale.customer_phone
    ? sb.from("customers").select("address").eq("phone", sale.customer_phone).maybeSingle()
    : Promise.resolve({ data: null });
  const showroomP = sale.showroom_id
    ? sb.from("showrooms").select("id,name,code,address,city,phone,manager_name").eq("id", sale.showroom_id).maybeSingle()
    : Promise.resolve({ data: null });

  let priorSalesQ = sb.from("sales")
    .select("id,due,customer_id,customer_phone,created_at")
    .neq("id", sale.id).lt("created_at", sale.created_at);
  let priorPaysQ = sb.from("customer_payments")
    .select("amount,customer_id,customer_phone,sale_id,created_at")
    .is("sale_id", null).lt("created_at", sale.created_at);
  if (sale.customer_id) {
    priorSalesQ = salePhone
      ? priorSalesQ.or(`customer_id.eq.${sale.customer_id},customer_phone.eq.${sale.customer_phone}`)
      : priorSalesQ.eq("customer_id", sale.customer_id);
    priorPaysQ = salePhone
      ? priorPaysQ.or(`customer_id.eq.${sale.customer_id},customer_phone.eq.${sale.customer_phone}`)
      : priorPaysQ.eq("customer_id", sale.customer_id);
  } else if (salePhone) {
    priorSalesQ = priorSalesQ.eq("customer_phone", sale.customer_phone);
    priorPaysQ = priorPaysQ.eq("customer_phone", sale.customer_phone);
  }

  const [itemsRes, paysRes, showroomRes, custIdRes, custPhoneRes, priorSalesRes, priorPaysRes] = await Promise.all([
    tryItemSelects(sale.id),
    sb.from("sale_payments").select("method, amount, reference").eq("sale_id", sale.id).order("created_at", { ascending: true }),
    showroomP,
    custByIdP,
    custByPhoneP,
    (sale.customer_id || salePhone) ? priorSalesQ : Promise.resolve({ data: [] }),
    (sale.customer_id || salePhone) ? priorPaysQ : Promise.resolve({ data: [] }),
  ]);

  const items = itemsRes.data ?? [];
  const pays = (paysRes as any)?.data ?? [];
  const showroom = (showroomRes as any)?.data ?? null;
  const customerAddress = ((custIdRes as any)?.data?.address ?? (custPhoneRes as any)?.data?.address) ?? undefined;
  const previousDue = await calculatePreviousDueFrom(
    sale,
    (priorSalesRes as any)?.data ?? [],
    (priorPaysRes as any)?.data ?? [],
  );

  const total = Number(sale.total || 0);
  const paid = Number(sale.paid || 0);
  const due = Math.max(0, total - paid);
  const mode: "cash" | "due" | "partial" = paid <= 0 ? "due" : paid >= total ? "cash" : "partial";
  const ref = sale.external_ref
    ?? `${settings.numberPrefix}${String(sale.id).slice(0, settings.numberPadding).toUpperCase()}`;

  return {
    customer: {
      name: sale.customer_name ?? "Walk-in Customer",
      phone: sale.customer_phone ?? "",
      address: customerAddress,
    },
    branch: showroom?.name ?? "Factory",
    showroom,
    reference: ref,
    date: sale.created_at ?? new Date().toISOString(),
    mode,
    items: items.map((it: any) => ({
      name: it.products?.name ?? it.product_name ?? "Item",
      sku: it.products?.sku ?? it.product_sku ?? "",
      price: Number(it.unit_price || 0),
      qty: Number(it.qty || 0),
      discount: 0,
    })),
    subtotal: Number(sale.subtotal ?? total),
    discount: Number(sale.discount ?? 0),
    tax: Number(sale.tax ?? 0),
    shipping: Number(sale.shipping ?? 0),
    total, paid, due, previousDue,
    payments: pays.map((p: any) => ({
      method: p.method ?? "cash",
      amount: Number(p.amount || 0),
      reference: p.reference ?? null,
    })),
  };
}


function InvoiceView() {
  const { id } = useParams({ from: "/invoice/$id" });
  const s = useSearch({ from: "/invoice/$id" });

  const [stored, setStored] = useState<InvoiceSnapshot | null>(null);
  const [company, setCompany] = useState<CompanySettings>(defaultCompany);
  const [settings, setSettings] = useState<InvoiceSettings>(defaultInvoiceSettings);
  const [paper, setPaper] = useState<PaperSize>("80mm");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([getCompany(), getInvoiceSettings()]).then(async ([c, inv]) => {
      setCompany(c);
      setSettings(inv);
      setPaper(inv.defaultPaper);
      // Prefer fresh DB data; fall back to local snapshot only if DB has nothing
      let snap: InvoiceSnapshot | null = null;
      try {
        snap = await fetchSaleSnapshot(id, inv);
      } catch { /* ignore */ }
      if (!snap) {
        try {
          const raw = localStorage.getItem(`invoice:${id}`) ?? sessionStorage.getItem(`invoice:${id}`);
          if (raw) snap = JSON.parse(raw) as InvoiceSnapshot;
        } catch { /* ignore */ }
      }
      if (snap) setStored(snap);
      setReady(true);
    }).catch(() => setReady(true));
  }, [id]);


  useEffect(() => {
    if (!ready) return;
    // Auto-print only when explicitly requested via ?ap=1 (e.g. from POS after sale).
    // Plain reference clicks (from ledger, sales list) just view.
    if (s.ap !== 1) return;
    const t = setTimeout(() => { try { window.print(); } catch { /* ignore */ } }, 500);
    return () => clearTimeout(t);
  }, [ready, s.ap]);

  // Build a snapshot even when localStorage is empty (falls back to query params)
  const snapshot: InvoiceSnapshot = stored ?? {
    customer: { name: s.c ?? "Walk-in Customer" },
    branch: s.b ?? "Main Branch",
    showroom: null,
    reference: `${settings.numberPrefix}${id.slice(0, settings.numberPadding).toUpperCase()}`,
    date: s.d ?? new Date().toISOString(),
    mode: "cash",
    items: [],
    subtotal: s.t ? +(s.t / 1.05).toFixed(2) : 0,
    tax: s.t ? +(s.t - s.t / 1.05).toFixed(2) : 0,
    shipping: 0,
    total: s.t ?? 0,
    paid: s.p ?? 0,
    due: Math.max(0, +((s.t ?? 0) - (s.p ?? 0)).toFixed(2)),
  };

  const print = () => window.print();
  const share = async () => {
    const url = window.location.href;
    try {
      if ((navigator as { share?: (d: { title: string; text: string; url: string }) => Promise<void> }).share) {
        await (navigator as { share: (d: { title: string; text: string; url: string }) => Promise<void> }).share({
          title: `Invoice ${snapshot.reference}`,
          text: `${snapshot.reference} — ${settings.currencySymbol}${snapshot.total.toFixed(settings.decimals)}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Invoice link copied to clipboard");
      }
    } catch { /* cancelled */ }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: ${paper === "A4" ? "A4" : paper + " auto"}; margin: ${paper === "A4" ? "10mm" : "0"}; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .a4-invoice { display: ${paper === "A4" ? "block" : "none"} !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; max-width: 100% !important; }
          .thermal-only { display: ${paper === "A4" ? "none" : "block"} !important; }
          .print-hide { display: none !important; }
        }
      `}</style>

      <InvoicePreview snapshot={snapshot} settings={settings} company={company} paper={paper} />

      <div className="max-w-3xl mx-auto mt-4 space-y-3 print-hide">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Paper:</span>
          {(["58mm", "80mm", "A4"] as const).map((p) => (
            <button key={p} onClick={() => setPaper(p)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition ${paper === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={share} className="inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm hover:bg-accent">
            <Share2 className="size-4" /> Share
          </button>
          <button onClick={print} className="inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90">
            <Printer className="size-4" /> Print
          </button>
        </div>
      </div>
    </div>
  );
}
