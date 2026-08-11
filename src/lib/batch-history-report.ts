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

/** Material column key: same material name may appear with different units. */
type MatCol = { name: string; unit: string };

function materialColumns(rows: BatchReportRow[]): MatCol[] {
  const seen = new Map<string, MatCol>();
  for (const r of rows) {
    for (const m of r.materials) {
      const key = `${m.name}||${m.unit}`;
      if (!seen.has(key)) seen.set(key, { name: m.name, unit: m.unit });
    }
  }
  return [...seen.values()];
}

const cellFor = (r: BatchReportRow, c: MatCol) => {
  const hit = r.materials.filter((m) => m.name === c.name && m.unit === c.unit);
  if (!hit.length) return null;
  return hit.reduce((a, m) => a + m.qty, 0);
};

/**
 * A4 landscape matrix production report: one row per batch, one column group per
 * raw material with an "Estimated" (system deducted) and a blank "Actual" column
 * the production manager fills in by hand so the owner can compare.
 */
export function renderBatchHistoryHtml({ company, rangeLabel, rows }: BatchReportOptions) {
  const cols = materialColumns(rows);
  const totals = rows.reduce(
    (a, r) => ({
      qty: a.qty + r.qty,
      cost: a.cost + r.cost,
      overhead: a.overhead + r.overhead,
      value: a.value + r.value,
    }),
    { qty: 0, cost: 0, overhead: 0, value: 0 },
  );
  const colTotals = cols.map((c) => rows.reduce((a, r) => a + (cellFor(r, c) ?? 0), 0));

  const groupHead = cols.map((c) => `<th class="grp" colspan="2">${esc(c.name)}</th>`).join("");
  const subHead = cols.map(() => `<th class="r">Estimated</th><th class="ac">Actual</th>`).join("");

  const body = rows
    .map((r) => {
      const cells = cols
        .map((c) => {
          const v = cellFor(r, c);
          return `<td class="r">${v === null ? "" : `${num(v, 4)}${esc(c.unit)}`}</td><td class="ac"></td>`;
        })
        .join("");
      return `<tr>
        <td class="mono">#${esc(r.batchNo)}</td>
        <td>${esc(r.dateTime)}</td>
        <td class="pr">${esc(r.productName)}</td>
        <td class="r">${num(r.qty, 3)}</td>
        ${cells}
      </tr>`;
    })
    .join("");

  const blanks = Array.from({ length: Math.max(0, 2 - rows.length) })
    .map(
      () =>
        `<tr class="bl"><td></td><td></td><td></td><td></td>${cols.map(() => `<td></td><td class="ac"></td>`).join("")}</tr>`,
    )
    .join("");

  const footCells = colTotals
    .map((t, i) => `<th class="r">${t ? `${num(t, 4)}${esc(cols[i].unit)}` : ""}</th><th class="ac"></th>`)
    .join("");

  const span = 4 + cols.length * 2;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Daily Production Report</title>
<style>
  @page { size: A4 landscape; margin: 6mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#111; margin:0; }
  #pg { transform-origin: top left; }
  .top { display:flex; align-items:stretch; gap:4mm; border-bottom:1.5px solid #111; padding-bottom:4px; margin-bottom:5px; }
  .hd { flex:1; text-align:center; }
  .co { font-size:16px; font-weight:800; }
  .ad { font-size:9.5px; color:#444; margin-top:1px; }
  .ti { font-size:12px; font-weight:700; margin-top:3px; }
  .dt { font-size:9px; color:#555; margin-top:1px; }
  .sum { width:70mm; }
  .sum .st { text-align:center; font-size:12px; font-weight:800; margin-bottom:2px; }
  .sum table { width:100%; }
  .sum td { padding:1px 5px; font-size:9.5px; border:none; }
  .sum td.k { font-weight:600; }
  .sum td.v { text-align:right; width:34%; }
  table { border-collapse:collapse; width:100%; font-size:9px; table-layout:fixed; }
  th, td { border:1px solid #b9b9b9; padding:1.5px 3px; word-wrap:break-word; }
  thead th { background:#dbe5f1; font-weight:700; text-align:center; line-height:1.15; }
  th.grp { background:#cfdcee; }
  tfoot th { background:#eef2f7; }
  tbody tr.bl td { height:12px; }
  .r { text-align:right; }
  .ac { width:11mm; background:#fff; }
  th.cb { width:16mm; }
  th.cd { width:26mm; }
  th.cp { width:52mm; }
  th.cq { width:14mm; }
  td.pr { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  tr { page-break-inside: avoid; }
  .sg { margin-top:12px; display:flex; justify-content:space-between; font-size:10px; }
  .sg div { border-top:1px solid #555; padding-top:4px; width:60mm; text-align:center; }
  .ft { margin-top:6px; font-size:9.5px; color:#666; display:flex; justify-content:space-between; }
</style></head><body>
  <div class="top">
    <div class="hd">
      <div class="co">${esc(company.name)}</div>
      ${company.address ? `<div class="ad">${esc(company.address)}</div>` : ""}
      ${company.phone || company.email ? `<div class="ad">${esc([company.phone, company.email].filter(Boolean).join(" · "))}</div>` : ""}
      <div class="ti">Daily Production Report — Batch wise</div>
      <div class="dt">Period: ${esc(rangeLabel)} &nbsp;·&nbsp; Printed: ${esc(new Date().toLocaleString("en-GB"))}</div>
    </div>
    <div class="sum">
      <div class="st">Summary</div>
      <table>
        <tr><td class="k">Total Batches</td><td class="v">${rows.length}</td></tr>
        <tr><td class="k">Total Produced Qty</td><td class="v">${num(totals.qty, 3)}</td></tr>
        <tr><td class="k">Total Raw Materials Cost</td><td class="v">${num(totals.cost)}</td></tr>
        <tr><td class="k">Total Overhead Cost</td><td class="v">${num(totals.overhead)}</td></tr>
        <tr><td class="k">Total Production Value</td><td class="v">${num(totals.value)}</td></tr>
      </table>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" class="cb">Batch</th><th rowspan="2" class="cd">Date &amp; time</th>
        <th rowspan="2" class="cp">Product</th><th rowspan="2" class="cq">Qty</th>
        ${groupHead}
      </tr>
      <tr>${subHead}</tr>
    </thead>
    <tbody>${body || `<tr><td colspan="${span}" style="text-align:center;padding:14px">No batches in this period</td></tr>`}${body ? blanks : ""}</tbody>
    <tfoot><tr>
      <th colspan="3" style="text-align:left">${rows.length} batch(es)</th>
      <th class="r">${num(totals.qty, 3)}</th>
      ${footCells}
    </tr></tfoot>
  </table>
  <div class="sg"><div>Artisan</div><div>Production Manager</div><div>Owner / Accounts</div></div>
  <div class="ft"><span>"Actual" columns are filled in by hand — quantity actually taken by the artisan.</span><span>${esc(company.name)}</span></div>
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
</body></html>`;
}

export function printBatchHistoryReport(opts: BatchReportOptions) {
  const html = renderBatchHistoryHtml(opts);
  const w = window.open("", "_blank", "width=1200,height=1000");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

export function exportBatchHistoryXlsx(opts: BatchReportOptions & { fileName: string }) {
  const { company, rangeLabel, rows, fileName } = opts;
  const cols = materialColumns(rows);
  const t = rows.reduce(
    (a, r) => ({ qty: a.qty + r.qty, cost: a.cost + r.cost, oh: a.oh + r.overhead, val: a.val + r.value }),
    { qty: 0, cost: 0, oh: 0, val: 0 },
  );

  const aoa: (string | number)[][] = [
    [company.name],
    [company.address ?? ""],
    ["Daily Production Report — Batch wise"],
    [`Period: ${rangeLabel}`],
    [],
    ["Summary", "", `Total Batches: ${rows.length}`, `Total Raw Materials Cost: ${t.cost}`, `Total Overhead Cost: ${t.oh}`],
    [],
  ];

  const group: (string | number)[] = ["Batch", "Date & time", "Product", "Quantity"];
  const sub: (string | number)[] = ["", "", "", ""];
  for (const c of cols) {
    group.push(`${c.name}${c.unit ? ` (${c.unit})` : ""}`, "");
    sub.push("Estimated", "Actual");
  }
  aoa.push(group, sub);

  for (const r of rows) {
    const line: (string | number)[] = [`#${r.batchNo}`, r.dateTime, r.productName, r.qty];
    for (const c of cols) {
      const v = cellFor(r, c);
      line.push(v === null ? "" : v, "");
    }
    aoa.push(line);
  }

  aoa.push([]);
  const foot: (string | number)[] = [`${rows.length} batch(es)`, "", "", t.qty];
  for (const c of cols) {
    foot.push(rows.reduce((a, r) => a + (cellFor(r, c) ?? 0), 0), "");
  }
  aoa.push(foot);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 26 }, { wch: 10 }, ...cols.flatMap(() => [{ wch: 12 }, { wch: 10 }])];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Batch History");
  XLSX.writeFile(wb, fileName);
}
