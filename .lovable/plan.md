# Batch history print: big readable type, no shrinking

Problem: the report still shrinks (width fit script scales down to 0.7) so printed figures are tiny. Fitting every raw-material column onto one sheet width is the cause.

## Approach: split materials into vertical column blocks, repeat the batch identity on every block

Instead of squeezing all material columns into one sheet width, the material columns are split into blocks that comfortably fit a Legal-landscape sheet at full size. Each block prints as its own table, and every block repeats the identity columns — Batch, Date, Product, Qty — so on page 2 (or any block) it is always clear which material belongs to which product.

```text
Block 1 (page 1)                     Block 2 (page 2)
Batch Date Product Qty | Flour Sugar   Batch Date Product Qty | Butter Egg
#1001 01-09 Bun   50   |  12    3      #1001 01-09 Bun   50   |   2     4
#1002 01-09 Cake  20   |   8    5      #1002 01-09 Cake  20   |   1     6
```

## Changes

1. Remove the shrink-to-fit script entirely — nothing is ever scaled below 100%.
2. Group material columns into blocks sized to the printable width (identity columns ~93mm, each material group ~26mm → roughly 8 material groups per sheet). One block = one table, each starting on a new page.
3. Larger type: base table font ~15px, header ~16px bold, totals bold, padding 6px, 1px borders. Company name ~26px, title ~19px.
4. Each block table keeps `thead { table-header-group }` and `tfoot { table-footer-group }`, so if one block's rows run over a sheet the header and totals repeat and the product name is still on every printed line.
5. Rows never split (`page-break-inside: avoid`); blocks separated with `page-break-before: always` from the second block on.
6. Block label above each table ("Materials 1 of 2 — Flour … Sugar") plus the report header repeated per block so any loose sheet is identifiable.
7. Signature block and footer note print once, after the last block.
8. Excel export unchanged.

## Technical notes

All edits in `src/lib/batch-history-report.ts` (`renderBatchHistoryHtml`): chunk `materialColumns(rows)` into groups, render one `<table>` per chunk with the four identity columns repeated, bump font sizes/padding in the `<style>` block, drop the `#pg` transform/fit script (keep `window.print()` after fonts load). No changes to data fetching, totals, or `production.batch-history.tsx`.
