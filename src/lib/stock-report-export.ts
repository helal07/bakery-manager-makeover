import * as XLSX from "xlsx";
import type { CompanySettings } from "@/lib/company-settings";

export type StockExportColumn = { key: string; label: string; align?: "left" | "right" };
export type StockExportRow = Record<string, string | number>;

function todayLabel() {
  return new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function exportStockXlsx(opts: {
  fileName: string;
  sheetName: string;
  title: string;
  company: CompanySettings;
  columns: StockExportColumn[];
  rows: StockExportRow[];
  totalsLabel?: string;
  totals?: StockExportRow;
}) {
  const { company, columns, rows, title } = opts;
  const aoa: (string | number)[][] = [
    [company.name],
    [company.address ?? ""],
    [[company.phone, company.email].filter(Boolean).join(" · ")],
    [title],
    [`Generated: ${todayLabel()}`],
    [],
    columns.map((c) => c.label),
    ...rows.map((r) => columns.map((c) => r[c.key] ?? "")),
  ];
  if (opts.totals) {
    aoa.push(columns.map((c, i) => (i === 0 ? (opts.totalsLabel ?? "Total") : (opts.totals![c.key] ?? ""))));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(12, c.label.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName.slice(0, 30));
  XLSX.writeFile(wb, opts.fileName);
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));

export type StockReportOptions = {
  title: string;
  company: CompanySettings;
  columns: StockExportColumn[];
  rows: StockExportRow[];
  totalsLabel?: string;
  totals?: StockExportRow;
  note?: string;
};

/** Pure A4 report renderer — no DOM access, so it can be unit-tested. */
export function renderStockReportHtml(opts: StockReportOptions) {

  const { company, columns, rows, title } = opts;
  const head = columns
    .map((c) => `<th style="text-align:${c.align === "right" ? "right" : "left"}">${esc(c.label)}</th>`)
    .join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${columns
          .map((c) => `<td style="text-align:${c.align === "right" ? "right" : "left"}">${esc(r[c.key])}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  const foot = opts.totals
    ? `<tfoot><tr>${columns
        .map((c, i) =>
          i === 0
            ? `<th style="text-align:left">${esc(opts.totalsLabel ?? "Total")}</th>`
            : `<th style="text-align:${c.align === "right" ? "right" : "left"}">${esc(opts.totals![c.key] ?? "")}</th>`,
        )
        .join("")}</tr></tfoot>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#111; margin:0; }
  .wrap { width: 182mm; margin: 0 auto; }
  .hd { text-align:center; border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:12px; }
  .co { font-size:20px; font-weight:800; letter-spacing:.3px; }
  .ad { font-size:11px; color:#444; margin-top:2px; }
  .ti { font-size:14px; font-weight:700; margin-top:8px; text-transform:uppercase; letter-spacing:.5px; }
  .dt { font-size:10.5px; color:#555; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th, td { border:1px solid #cfcfcf; padding:5px 7px; }
  thead th { background:#f1f1f1; font-weight:700; }
  tfoot th { background:#f1f1f1; }
  tbody tr:nth-child(even) td { background:#fafafa; }
  .ft { margin-top:10px; font-size:10px; color:#666; display:flex; justify-content:space-between; }
</style></head><body><div class="wrap">
  <div class="hd">
    <div class="co">${esc(company.name)}</div>
    ${company.address ? `<div class="ad">${esc(company.address)}</div>` : ""}
    ${company.phone || company.email ? `<div class="ad">${esc([company.phone, company.email].filter(Boolean).join(" · "))}</div>` : ""}
    <div class="ti">${esc(title)}</div>
    <div class="dt">Date: ${esc(todayLabel())}</div>
  </div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
  <div class="ft"><span>${esc(opts.note ?? "")}</span><span>${esc(rows.length)} line item(s)</span></div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
