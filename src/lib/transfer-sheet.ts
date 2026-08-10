import type { CompanySettings } from "@/lib/company-settings";

export type TransferSheetLine = { name: string; sku?: string | null; qty: number; unit?: string | null };

export type TransferSheetData = {
  company: CompanySettings;
  code: string;
  status: string;
  kind?: string | null;
  from: string;
  to: string;
  note?: string | null;
  createdAt?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  lines: TransferSheetLine[];
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));

const dt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Pure renderer so it can be unit-tested without a DOM. */
export function renderTransferSheetHtml(d: TransferSheetData) {
  const rows = d.lines
    .map(
      (l, i) => `<tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${esc(l.name)}</td>
      <td>${esc(l.sku ?? "")}</td>
      <td style="text-align:right">${esc(l.qty)} ${esc(l.unit ?? "")}</td>
      <td style="width:70px"></td>
    </tr>`,
    )
    .join("");
  const totalQty = d.lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const title = d.kind === "damaged_return" ? "Damaged Return Sheet" : "Stock Transfer Sheet";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} ${esc(d.code)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#111; margin:0; }
  .wrap { width: 182mm; margin: 0 auto; }
  .hd { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:8px; }
  .co { font-size:19px; font-weight:800; }
  .ad { font-size:11px; color:#444; margin-top:2px; }
  .ti { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; text-align:right; }
  .code { font-family:ui-monospace, monospace; font-size:12px; margin-top:3px; text-align:right; }
  .meta { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 18px; margin:12px 0 14px; font-size:11.5px; }
  .meta div span { color:#666; display:inline-block; min-width:78px; }
  table { width:100%; border-collapse:collapse; font-size:11.5px; }
  th, td { border:1px solid #cfcfcf; padding:5px 7px; }
  thead th { background:#f1f1f1; font-weight:700; }
  tfoot th { background:#f1f1f1; }
  .note { margin-top:10px; font-size:11px; color:#444; }
  .sign { margin-top:26mm; display:flex; justify-content:space-between; font-size:11px; }
  .sign div { border-top:1px solid #111; padding-top:4px; width:52mm; text-align:center; }
  .ft { margin-top:10px; font-size:10px; color:#666; }
</style></head><body><div class="wrap">
  <div class="hd">
    <div>
      <div class="co">${esc(d.company.name)}</div>
      ${d.company.address ? `<div class="ad">${esc(d.company.address)}</div>` : ""}
      ${d.company.phone || d.company.email ? `<div class="ad">${esc([d.company.phone, d.company.email].filter(Boolean).join(" · "))}</div>` : ""}
    </div>
    <div>
      <div class="ti">${esc(title)}</div>
      <div class="code">${esc(d.code)}</div>
      <div class="code">Status: ${esc(d.status)}</div>
    </div>
  </div>
  <div class="meta">
    <div><span>From</span> ${esc(d.from)}</div>
    <div><span>To</span> ${esc(d.to)}</div>
    <div><span>Created</span> ${esc(dt(d.createdAt))}</div>
    <div><span>Sent</span> ${esc(dt(d.sentAt))}</div>
    <div><span>Received</span> ${esc(dt(d.receivedAt))}</div>
    <div><span>Printed</span> ${esc(dt(new Date().toISOString()))}</div>
  </div>
  <table>
    <thead><tr><th style="width:34px">#</th><th>Product</th><th style="width:90px">SKU</th><th style="width:90px;text-align:right">Qty</th><th>Received</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><th colspan="3" style="text-align:left">Total</th><th style="text-align:right">${esc(totalQty)}</th><th></th></tr></tfoot>
  </table>
  ${d.note ? `<div class="note"><b>Note:</b> ${esc(d.note)}</div>` : ""}
  <div class="sign"><div>Prepared by</div><div>Dispatched by</div><div>Received by</div></div>
  <div class="ft">${esc(d.lines.length)} line item(s)</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
</body></html>`;
}

export function printTransferSheet(d: TransferSheetData) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(renderTransferSheetHtml(d));
  w.document.close();
  return true;
}
