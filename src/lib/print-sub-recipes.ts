import type { SubRecipe } from "@/lib/sub-recipe-store";
import type { RawMaterial } from "@/lib/raw-material-store";
import { getCachedCompany, defaultCompany } from "@/lib/company-settings";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const n = (v: number, d = 4) =>
  Number.isFinite(v) ? v.toFixed(d) : (0).toFixed(d);

function blockHtml(sr: SubRecipe, idx: number, materials: RawMaterial[]) {
  const totalQty = sr.items.reduce((s, it) => s + (it.qty || 0), 0);
  const rows = sr.items
    .map((it) => {
      const raw = materials.find((r) => r.id === it.materialId);
      const unitCost = raw?.cost ?? 0;
      const lineCost = unitCost * (it.qty || 0);
      const pct = totalQty > 0 ? ((it.qty || 0) / totalQty) * 100 : 0;
      const perUnit = sr.yield_qty > 0 ? (it.qty || 0) / sr.yield_qty : 0;
      return `<tr>
        <td>${esc(raw?.name ?? "—")}</td>
        <td class="num">${n(it.qty || 0)}</td>
        <td>${esc(raw?.unit ?? "")}</td>
        <td class="num">${pct.toFixed(2)}%</td>
        <td class="num strong">${n(perUnit, 6)}</td>
        <td class="num">${unitCost.toFixed(2)}</td>
        <td class="num">${lineCost.toFixed(2)}</td>
      </tr>`;
    })
    .join("");
  const totalCost = sr.items.reduce((s, it) => {
    const raw = materials.find((r) => r.id === it.materialId);
    return s + (raw?.cost ?? 0) * (it.qty || 0);
  }, 0);
  const perUnitCost = sr.yield_qty > 0 ? totalCost / sr.yield_qty : 0;

  return `<section class="sr">
    <div class="sr-head">
      <div class="sr-title">${idx}. ${esc(sr.name)}</div>
      <div class="sr-meta">Yield: <b>${n(sr.yield_qty, 4)} ${esc(sr.yield_unit)}</b>
        &nbsp;·&nbsp; Ingredients: ${sr.items.length}
        &nbsp;·&nbsp; Cost / ${esc(sr.yield_unit)}: <b>${perUnitCost.toFixed(2)}</b></div>
    </div>
    <table>
      <thead><tr>
        <th>Raw material</th><th class="num">Saved qty</th><th>Unit</th>
        <th class="num">Ratio %</th><th class="num">Per 1 ${esc(sr.yield_unit)} yield</th>
        <th class="num">Unit cost</th><th class="num">Line cost</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty">No ingredients</td></tr>`}</tbody>
      <tfoot><tr>
        <td class="strong">Total</td>
        <td class="num strong">${n(totalQty)}</td>
        <td colspan="4"></td>
        <td class="num strong">${totalCost.toFixed(2)}</td>
      </tr></tfoot>
    </table>
  </section>`;
}

export function printSubRecipes(subRecipes: SubRecipe[], materials: RawMaterial[]) {
  const company = getCachedCompany() ?? defaultCompany;
  const now = new Date();
  const stamp = now.toLocaleString();
  const body = subRecipes.map((sr, i) => blockHtml(sr, i + 1, materials)).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Sub-Recipe Snapshot</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Noto Sans Bengali", "Hind Siliguri", Arial, "Segoe UI", sans-serif;
         font-size: 11px; color: #111; margin: 0; }
  header { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
  .co { font-size: 16px; font-weight: 700; }
  .addr { font-size: 10px; color: #444; }
  .doc { margin-top: 4px; font-size: 12px; font-weight: 600; }
  .note { font-size: 10px; color: #666; }
  section.sr { margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid;
               border: 1px solid #ccc; border-radius: 4px; overflow: hidden; }
  .sr-head { background: #f3f3f3; padding: 5px 7px; }
  .sr-title { font-size: 12px; font-weight: 700; }
  .sr-meta { font-size: 10px; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-top: 1px solid #ddd; padding: 3px 6px; text-align: left; }
  th { background: #fafafa; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; color: #555; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; }
  tfoot td { background: #f7f7f7; }
  .empty { color: #888; font-style: italic; }
  footer { margin-top: 10px; font-size: 9px; color: #777; text-align: center; }
</style></head><body>
<header>
  <div class="co">${esc(company.name || "")}</div>
  <div class="addr">${esc(company.address || "")}${company.phone ? " · " + esc(company.phone) : ""}</div>
  <div class="doc">Sub-Recipe Detail Snapshot (${subRecipes.length} sub-recipe${subRecipes.length === 1 ? "" : "s"})</div>
  <div class="note">Printed: ${esc(stamp)} · Snapshot taken before unit-conversion change</div>
</header>
${body}
<footer>Per-yield-unit ratio is what production uses to deduct stock. Keep this copy for verification.</footer>
<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400);};<\/script>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=800");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
