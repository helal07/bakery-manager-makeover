# Batch history print: big readable type, no shrinking

Problem: the report still shrinks (width fit script scales down to 0.7) so printed figures are tiny. Fitting every raw-material column onto one sheet width is the cause.

## Approach: split materials into vertical column blocks, repeat the batch identity on every block

Instead of squeezing all material columns into one sheet width, the material columns are split into blocks that comfortably fit a Legal-landscape sheet at full size. Each block prints as its own table, and every block repeats the identity columns — Batch, Product, Qty, Supply Value — so on page 2 (or any block) it is always clear which material belongs to which product.

```text
Block 1 (page 1)                   Block 2 (page 2)
Batch Product Qty Supply | Flour   Batch Product Qty Supply | Butter Egg
#1001 Bun     50   ৳60 |  12  3  #1001 Bun     50   ৳60 |   2     4
#1002 Cake    20   ৳30 |   8  5  #1002 Cake    20   ৳30 |   1     6
```

## Changes

1. Remove the shrink-to-fit script entirely — nothing is ever scaled below 100%.
2. Group material columns into blocks sized to the printable width (identity columns ~95mm, each material group ~26mm → roughly 8 material groups per sheet). One block = one table, each starting on a new page.
3. Larger type: base table font ~15px, header ~16px bold, totals bold, padding 6px, 1px borders. Company name ~26px, title ~19px.
4. Each block table keeps `thead { table-header-group }` and `tfoot { table-footer-group }`, so if one block's rows run over a sheet the header and totals repeat and the product name is still on every printed line.
5. Rows never split (`page-break-inside: avoid`); blocks separated with `page-break-before: always` from the second block on.
6. Block label above each table ("Materials 1 of 2 — Flour … Sugar") plus the report header repeated per block so any loose sheet is identifiable.
7. Signature block and footer note print once, after the last block.
8. Excel export unchanged.

## Additional requirements folded in

- Replace the per-row "Production Value" column with **Showroom Supply Price (৳)**. The value shown is the product's default supply price (`products.transfer_price`) for that batch's product, formatted in BDT with ৳ symbol.
- Remove the per-row Date column from the printed table. The period is already printed once in the headline, so the table only needs Batch, Product, Qty, and Supply Price as identity columns.

## Technical notes

All edits in `src/lib/batch-history-report.ts` (`renderBatchHistoryHtml`):
- Chunk `materialColumns(rows)` into groups.
- Render one `<table>` per chunk with identity columns `Batch | Product | Qty | Supply Price (৳)` repeated.
- Add `transfer_price` lookup per row product; fall back to `0` if not set.
- Bump font sizes/padding in the `<style>` block.
- Drop the `#pg` transform/fit script (keep `window.print()` after fonts load).

No changes to data fetching, totals, or `production.batch-history.tsx`.

