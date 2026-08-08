import * as XLSX from "xlsx";
import type { CompanySettings } from "@/lib/company-settings";

export type BatchMaterialLine = {
  name: string;
  qty: number;
  unit: string;
  cost: number;
};

export type BatchReportRow = {
  batchNo: string;
  dateTime: string;
  productName: string;
  qty: number;
  cost: number;
  overhead: number;
  value: number;
  materials: BatchMaterialLine[];
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));

const num = (n: number, d = 2) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Number(n) || 0);

export type BatchReportOptions = {
  company: CompanySettings;
  rangeLabel: string;
  rows: BatchReportRow[];
};

/**
 * A4 daily production report. Each batch is a header row followed by the raw
 * materials it actually consumed. The "Actual" column is intentionally blank —
 * the production manager fills it in by hand so the owner can compare what the
 * artisan really took against what the system deducted.
 */
export function renderBatchHistoryHtml({ company, rangeLabel, rows }: BatchReportOptions) {
  const totals = rows.reduce(
    (a, r) => ({
      qty: a.qty + r.qty,
      cost: a.cost + r.cost,
      overhead: a.overhead + r.overhead,
      value: a.value + r.value,
    }),
    { qty: 0, cost: 0, overhead: 0, value: 0 },
  );

  const body = rows
    .map((r) => {
      const head = `<tr class="bh">
        <td>${esc(r.dateTime)}</td>
        <td class="mono">#${esc(r.batchNo)}</td>
        <td>${esc(r.productName)}</td>
        <td class="r">${num(r.qty, 3)}</td>
        <td class="r">${num(r.cost)}</td>
        <td class="r">${num(r.overhead)}</td>
        <td class="r">${num(r.value)}</td>
        <td class="ac"></td>
      </tr>`;
      const mats = r.materials.length
        ? r.materials
            .map(
              (m) => `<tr class="mr">
                <td></td><td></td>
                <td class="ml">${esc(m.name)}</td>
                <td class="r">${num(m.qty, 4)} ${esc(m.unit)}</td>
                <td class="r">${num(m.cost)}</td>
                <td></td><td></td>
                <td class="ac"></td>
              </tr>`,
            )
            .join("")
        : `<tr class="mr"><td></td><td></td><td class="ml" colspan="5">No material consumption recorded</td><td class="ac"></td></tr>`;
      return head + mats;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Daily Production Report</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#111; margin:0; }
  .wrap { width: 186mm; margin: 0 auto; }
  .hd { text-align:center; border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:10px; }
  .co { font-size:20px; font-weight:800; letter-spacing:.3px; }
  .ad { font-size:11px; color:#444; margin-top:2px; }
  .ti { font-size:14px; font-weight:700; margin-top:8px; text-transform:uppercase; letter-spacing:.5px; }
  .dt { font-size:10.5px; color:#555; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:10.5px; }
  th, td { border:1px solid #cfcfcf; padding:4px 6px; vertical-align:top; }
  thead th { background:#ececec; font-weight:700; }
  tfoot th { background:#ececec; }
  tr.bh td { background:#f6f6f6; font-weight:700; }
  tr.mr td { color:#333; }
  td.ml { padding-left:14px; }
  .r { text-align:right; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .ac { width:20mm; background:#fff; }
  tr { page-break-inside: avoid; }
  .sg { margin-top:14px; display:flex; justify-content:space-between; font-size:10.5px; }
  .sg div { border-top:1px solid #555; padding-top:4px; width:52mm; text-align:center; }
  .ft { margin-top:8px; font-size:10px; color:#666; display:flex; justify-content:space-between; }
</style></head><body><div class="wrap">
  <div class="hd">
    <div class="co">${esc(company.name)}</div>
    ${company.address ? `<div class="ad">${esc(company.address)}</div>` : ""}
    ${company.phone || company.email ? `<div class="ad">${esc([company.phone, company.email].filter(Boolean).join(" · "))}</div>` : ""}
    <div class="ti">Daily Production Report — Batch wise</div>
    <div class="dt">Period: ${esc(rangeLabel)} &nbsp;·&nbsp; Printed: ${esc(new Date().toLocaleString("en-GB"))}</div>
  </div>
  <table>
    <thead><tr>
      <th>Date &amp; time</th><th>Batch</th><th>Product / Material</th>
      <th class="r">Qty</th><th class="r">Cost</th><th class="r">Overhead</th><th class="r">Value</th>
      <th class="r">Actual</th>
    </tr></thead>
    <tbody>${body || `<tr><td colspan="8" style="text-align:center;padding:14px">No batches in this period</td></tr>`}</tbody>
    <tfoot><tr>
      <th colspan="3" style="text-align:left">${rows.length} batch(es)</th>
      <th class="r">${num(totals.qty, 3)}</th>
      <th class="r">${num(totals.cost)}</th>
      <th class="r">${num(totals.overhead)}</th>
      <th class="r">${num(totals.value)}</th>
      <th></th>
    </tr></tfoot>
  </table>
  <div class="sg"><div>Artisan</div><div>Production Manager</div><div>Owner / Accounts</div></div>
  <div class="ft"><span>"Actual" column is filled in by hand — quantity actually taken by the artisan.</span><span>${esc(company.name)}</span></div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
</body></html>`;
}

export function printBatchHistoryReport(opts: BatchReportOptions) {
  const html = renderBatchHistoryHtml(opts);
  const w = window.open("", "_blank", "width=940,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

export function exportBatchHistoryXlsx(opts: BatchReportOptions & { fileName: string }) {
  const { company, rangeLabel, rows, fileName } = opts;
  const aoa: (string | number)[][] = [
    [company.name],
    [company.address ?? ""],
    ["Daily Production Report — Batch wise"],
    [`Period: ${rangeLabel}`],
    [],
    ["Date & time", "Batch", "Product / Material", "Qty", "Unit", "Cost", "Overhead", "Value", "Actual"],
  ];
  for (const r of rows) {
    aoa.push([r.dateTime, `#${r.batchNo}`, r.productName, r.qty, "", r.cost, r.overhead, r.value, ""]);
    for (const m of r.materials) {
      aoa.push(["", "", `   ${m.name}`, m.qty, m.unit, m.cost, "", "", ""]);
    }
  }
  const t = rows.reduce(
    (a, r) => ({ qty: a.qty + r.qty, cost: a.cost + r.cost, oh: a.oh + r.overhead, val: a.val + r.value }),
    { qty: 0, cost: 0, oh: 0, val: 0 },
  );
  aoa.push([]);
  aoa.push([`${rows.length} batch(es)`, "", "", t.qty, "", t.cost, t.oh, t.val, ""]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Batch History");
  XLSX.writeFile(wb, fileName);
}
