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

4. Overflow safety instead of shrinking
   - Only if the material columns are too wide for one Legal sheet, downscale mildly (never below 0.85) so text stays legible; beyond that the sheet simply prints the remaining material columns in a second table block on following pages (column chunking, e.g. max ~14 material columns per block, each block repeating Batch / Date / Product / Qty identity columns).

5. Excel export unchanged (same data, no layout concerns).

## Technical notes

All edits are in `src/lib/batch-history-report.ts` (`renderBatchHistoryHtml`): page size + typography CSS, removal of the `#sheet` clamp and fit script, thead/tfoot grouping, and a small chunking helper that splits `materialColumns(rows)` into blocks rendered as sequential tables. No changes to data fetching, totals, or `production.batch-history.tsx` logic.
