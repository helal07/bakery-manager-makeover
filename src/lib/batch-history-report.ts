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
  supplyPrice: number;
  materials: BatchMaterialLine[];
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m] as string));

const num = (n: number, d = 2) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Number(n) || 0);

const money = (n: number) => `৳${num(n, 2)}`;

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

function chunkColumns(cols: MatCol[], perBlock: number): MatCol[][] {
  const blocks: MatCol[][] = [];
  for (let i = 0; i < cols.length; i += perBlock) {
    blocks.push(cols.slice(i, i + perBlock));
  }
  return blocks;
}

/**
 * Batch history production report: one row per batch, one material column per
 * raw material. Material columns are split into blocks so each printed sheet is
 * large and readable; the identity columns (Batch, Product, Qty) repeat on every
 * block so a loose page is never ambiguous. Total Showroom Supply Price is shown
 * only in the top summary, not per batch.
 */
export function renderBatchHistoryHtml({ company, rangeLabel, rows }: BatchReportOptions) {
  const cols = materialColumns(rows);
  const totals = rows.reduce(
    (a, r) => ({
      qty: a.qty + r.qty,
      cost: a.cost + r.cost,
      overhead: a.overhead + r.overhead,
      supplyPrice: a.supplyPrice + r.qty * r.supplyPrice,
    }),
    { qty: 0, cost: 0, overhead: 0, supplyPrice: 0 },
  );
  const colTotals = cols.map((c) => rows.reduce((a, r) => a + (cellFor(r, c) ?? 0), 0));

  const perBlock = 9;
  const blocks = chunkColumns(cols, perBlock);
  const hasBlocks = blocks.length > 0;

  const renderBlock = (blockCols: MatCol[], index: number) => {
    const groupHead = blockCols.map((c) => `<th class="grp" colspan="2">${esc(colLabel(c))}</th>`).join("");
    const subHead = blockCols.map(() => `<th class="r">Est.</th><th class="ac">Act.</th>`).join("");

    const body = rows
      .map((r) => {
        const cells = blockCols
          .map((c) => {
            const v = cellFor(r, c);
            return `<td class="r">${v === null ? "" : qty(v)}</td><td class="ac"></td>`;
          })
          .join("");
        return `<tr>
          <td class="mono">#${esc(r.batchNo)}</td>
          <td class="pr">${esc(r.productName)}</td>
          <td class="r">${num(r.qty, 3)}</td>
          ${cells}
        </tr>`;
      })
      .join("");

    const blockColTotals = blockCols.map((c) => rows.reduce((a, r) => a + (cellFor(r, c) ?? 0), 0));
    const footCells = blockColTotals
      .map((t) => `<th class="r">${t ? qty(t) : ""}</th><th class="ac"></th>`)
      .join("");

    const blockLabel =
      hasBlocks && blocks.length > 1
        ? `<div class="block-label">Materials ${index + 1} of ${blocks.length} — ${esc(blockCols.map(colLabel).join(", "))}</div>`
        : "";

    const span = 3 + blockCols.length * 2;

    return `
      <div class="block${index > 0 ? " new-page" : ""}">
        ${blockLabel}
        <table>
          <thead>
            <tr>
              <th rowspan="2" class="cb">Batch</th>
              <th rowspan="2" class="cp">Product</th>
              <th rowspan="2" class="cq">Qty</th>
              ${groupHead}
            </tr>
            <tr>${subHead}</tr>
          </thead>
          <tbody>${body || `<tr><td colspan="${span}" style="text-align:center;padding:10px">No batches in this period</td></tr>`}</tbody>
          <tfoot><tr>
            <th colspan="2" style="text-align:left">${rows.length} batch(es)</th>
            <th class="r">${num(totals.qty, 3)}</th>
            ${footCells}
          </tr></tfoot>
        </table>
      </div>`;
  };


  const tablesHtml = hasBlocks
    ? blocks.map(renderBlock).join("")
    : renderBlock([], 0);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Daily Production Report</title>
<style>
  @page { size: Legal landscape; margin: 6mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#000; margin:0; }
  .top { border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; text-align:center; }
  .co { font-size:26px; font-weight:900; line-height:1.15; }
  .ad { font-size:14px; color:#222; }
  .ti { font-size:19px; font-weight:900; }
  .dt { font-size:14px; color:#333; font-weight:700; }
  .sum { display:flex; flex-wrap:wrap; justify-content:center; gap:4px 24px; font-size:14px; font-weight:800; margin:0 0 10px; }
  .block { width:100%; }
  .block.new-page { page-break-before: always; }
  .block-label { font-size:14px; font-weight:800; margin-bottom:4px; color:#111; }
  table { border-collapse:collapse; width:100%; font-size:15px; table-layout:fixed; }
  th, td { border:1.5px solid #000; padding:6px 5px; line-height:1.25; word-wrap:break-word; font-weight:800; }
  thead th { background:#dbe5f1; font-weight:900; text-align:center; color:#000; font-size:16px; }
  th.grp { background:#cfdcee; font-size:14px; }
  tfoot th { background:#eef2f7; font-weight:900; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  .r { text-align:right; }
  .ac { width:14mm; background:#fff; }
  th.cb { width:24mm; }
  th.cp { width:58mm; }
  th.cq { width:20mm; }
  td.nw { white-space:nowrap; }
  td.pr { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  .sg { margin-top:14px; display:flex; justify-content:space-between; font-size:14px; font-weight:800; page-break-inside:avoid; }
  .sg div { border-top:1.5px solid #333; padding-top:5px; width:75mm; text-align:center; }
  .ft { margin-top:6px; font-size:12px; color:#333; display:flex; justify-content:space-between; font-weight:700; }
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
    <span><b>Raw Materials Cost:</b> ${money(totals.cost)}</span>
    <span><b>Overhead:</b> ${money(totals.overhead)}</span>
    <span><b>Total Showroom Supply Price:</b> ${money(totals.supplyPrice)}</span>
  </div>
  ${tablesHtml}
  <div class="sg"><div>Artisan</div><div>Production Manager</div><div>Owner / Accounts</div></div>
  <div class="ft"><span>"Act." columns are filled in by hand — quantity actually taken by the artisan. Material quantities are in the unit shown in each column header.</span><span>${esc(company.name)}</span></div>
</div>
<script>window.onload=function(){
  var print=function(){ window.print(); };
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(print); } else { print(); }
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
