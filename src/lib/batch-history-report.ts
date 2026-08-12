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

/** Trim trailing zeros: 1.5000 -> 1.5, 0.2500 -> 0.25 */
const qty = (n: number) => {
  const v = Number(n) || 0;
  return String(Number(v.toFixed(3)));
};

const colLabel = (c: MatCol) => `${c.name}${c.unit ? ` (${c.unit})` : ""}`;

/**
 * A4 landscape matrix production report: one row per batch, one column group per
 * raw material with an "Estimated" (system deducted) and a blank "Actual" column
 * the production manager fills in by hand so the owner can compare.
 * Layout is tuned to fit everything on a single sheet.
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

  const groupHead = cols.map((c) => `<th class="grp" colspan="2">${esc(colLabel(c))}</th>`).join("");
  const subHead = cols.map(() => `<th class="r">Est.</th><th class="ac">Act.</th>`).join("");

  const body = rows
    .map((r) => {
      const cells = cols
        .map((c) => {
          const v = cellFor(r, c);
          return `<td class="r">${v === null ? "" : qty(v)}</td><td class="ac"></td>`;
        })
        .join("");
      return `<tr>
        <td class="mono">#${esc(r.batchNo)}</td>
        <td class="nw">${esc(r.dateTime)}</td>
        <td class="pr">${esc(r.productName)}</td>
        <td class="r">${num(r.qty, 3)}</td>
        ${cells}
      </tr>`;
    })
    .join("");

  const footCells = colTotals
    .map((t) => `<th class="r">${t ? qty(t) : ""}</th><th class="ac"></th>`)
    .join("");

  const span = 4 + cols.length * 2;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Daily Production Report</title>
<style>
  @page { size: A4 landscape; margin: 5mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#111; margin:0; }
  #pg { transform-origin: top left; }
  .top { border-bottom:1.2px solid #111; padding-bottom:2px; margin-bottom:3px; text-align:center; }
  .co { font-size:13px; font-weight:800; line-height:1.15; }
  .ad { font-size:8px; color:#444; }
  .ti { font-size:10px; font-weight:700; }
  .dt { font-size:7.5px; color:#555; }
  .sum { display:flex; flex-wrap:wrap; justify-content:center; gap:2px 10px; font-size:8px; margin:0 0 3px; }
  .sum span b { font-weight:700; }
  table { border-collapse:collapse; width:100%; font-size:7.5px; table-layout:fixed; }
  th, td { border:0.6px solid #b9b9b9; padding:1px 2px; line-height:1.1; word-wrap:break-word; }
  thead th { background:#dbe5f1; font-weight:700; text-align:center; }
  th.grp { background:#cfdcee; font-size:7px; }
  tfoot th { background:#eef2f7; }
  .r { text-align:right; }
  .ac { width:8mm; background:#fff; }
  th.cb { width:12mm; }
  th.cd { width:16mm; }
  th.cp { width:48mm; }
  th.cq { width:12mm; }
  td.nw { white-space:nowrap; }
  td.pr { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  tr { page-break-inside: avoid; }
  .sg { margin-top:5px; display:flex; justify-content:space-between; font-size:7.5px; }
  .sg div { border-top:0.8px solid #555; padding-top:2px; width:52mm; text-align:center; }
  .ft { margin-top:2px; font-size:7px; color:#666; display:flex; justify-content:space-between; }
</style></head><body>
<div id="pg">
  <div class="top">
    <div class="co">${esc(company.name)}</div>
    ${
      company.address || company.phone || company.email
        ? `<div class="ad">${esc([company.address, company.phone, company.email].filter(Boolean).join(" · "))}</div>`
        : ""
    }
    <div class="ti">Daily Production Report — Batch wise</div>
    <div class="dt">Period: ${esc(rangeLabel)} · Printed: ${esc(new Date().toLocaleString("en-GB"))}</div>
  </div>
  <div class="sum">
    <span><b>Batches:</b> ${rows.length}</span>
    <span><b>Produced Qty:</b> ${num(totals.qty, 3)}</span>
    <span><b>Raw Materials Cost:</b> ${num(totals.cost)}</span>
    <span><b>Overhead:</b> ${num(totals.overhead)}</span>
    <span><b>Production Value:</b> ${num(totals.value)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th rowspan="2" class="cb">Batch</th><th rowspan="2" class="cd">Date</th>
        <th rowspan="2" class="cp">Product</th><th rowspan="2" class="cq">Qty</th>
        ${groupHead}
      </tr>
      <tr>${subHead}</tr>
    </thead>
    <tbody>${body || `<tr><td colspan="${span}" style="text-align:center;padding:10px">No batches in this period</td></tr>`}</tbody>
    <tfoot><tr>
      <th colspan="3" style="text-align:left">${rows.length} batch(es)</th>
      <th class="r">${num(totals.qty, 3)}</th>
      ${footCells}
    </tr></tfoot>
  </table>
  <div class="sg"><div>Artisan</div><div>Production Manager</div><div>Owner / Accounts</div></div>
  <div class="ft"><span>"Act." columns are filled in by hand — quantity actually taken by the artisan. Material quantities are in the unit shown in each column header.</span><span>${esc(company.name)}</span></div>
</div>
<script>window.onload=function(){
  var fit=function(){
    var pg=document.getElementById('pg');
    // A4 landscape printable area at 96dpi minus 5mm margins
    var W=(297-10)/25.4*96, H=(210-10)/25.4*96;
    var s=Math.min(1, W/pg.scrollWidth, H/pg.scrollHeight);
    s=Math.max(0.6, s);
    if(s<1){ pg.style.transform='scale('+s+')'; pg.style.width=(100/s)+'%'; }
    setTimeout(function(){window.print()},200);
  };
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(fit); } else { fit(); }
}</script>
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

  const group: (string | number)[] = ["Batch", "Date", "Product", "Quantity"];
  const sub: (string | number)[] = ["", "", "", ""];
  for (const c of cols) {
    group.push(colLabel(c), "");
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
