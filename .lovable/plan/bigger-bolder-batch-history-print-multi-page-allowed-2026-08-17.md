# Bigger, bolder batch history print (multi-page allowed)

Problem: the report is forced onto one A4 sheet, so the auto-fit script shrinks everything until it is hard to read on paper.

## Changes

1. Stop forcing one page
   - Remove the fixed one-sheet container and the shrink-to-fit binary search.
   - Content flows naturally across as many pages as needed (2+ is fine).

2. Legal landscape paper, readable type
   - `@page { size: Legal landscape; margin: 6mm }` (355.6 x 215.9 mm) for more horizontal room per material column.
   - Base table font ~13px, headers ~14px bold, padding 4px, borders 1px; totals row and header keep heavier weight so figures read clearly at arm's length.
   - Company name ~24px, report title ~17px, summary strip ~13px.

3. Multi-page hygiene
   - Table header repeats on every page (`thead { display: table-header-group }`), totals row stays with `tfoot { display: table-footer-group }`.
   - Rows never split (`page-break-inside: avoid`).
   - Signature block and footer note only at the end of the document.
   - Page counter line ("Page X" via CSS where supported) is skipped; instead the header line with period + print time repeats via thead grouping.

4. All raw materials stay on the same row as their batch
   - No column chunking / no splitting material columns across pages — a batch and every one of its material figures always print on one line, so it is never ambiguous which material belongs to which product.
   - Pages break only between batches (vertically), never between material columns.
   - If the material set is genuinely wider than one Legal sheet, scale the whole width down just enough to fit (hard floor 0.7) so the row stays intact and still readable; the vertical flow keeps running onto page 2, 3, etc. at full size.

5. Excel export unchanged (same data, no layout concerns).

## Technical notes

All edits are in `src/lib/batch-history-report.ts` (`renderBatchHistoryHtml`): Legal-landscape page size, larger/bolder typography, removal of the one-sheet `#sheet` clamp, `thead`/`tfoot` table-header/footer-group so headers repeat on each page, `page-break-inside: avoid` on rows, and a width-only fit script (horizontal scale, height unclamped, floor 0.7). No column chunking. No changes to data fetching, totals, or `production.batch-history.tsx` logic.

