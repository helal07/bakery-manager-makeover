# Compact Batch History Print (A4)

Goal: fit the full batch-wise production report on as few A4 landscape pages as possible without dropping information.

## Changes

1. Short dates
   - Print date as `12/08 14:30` (dd/mm + time, no year) instead of the long locale string; year is already shown in the period line of the header.
   - Date column shrinks from 26mm to 16mm.

2. Tighter raw-material columns
   - Move the unit into the material column header (e.g. `Flour (kg)`) so each cell holds only a number — no repeated unit text per cell.
   - Round quantities smartly: up to 3 decimals, trailing zeros trimmed (1.5 instead of 1.5000).
   - Narrow the "Actual" hand-fill column to 8mm and reduce material column widths so more materials fit per page.

3. Space savings across the sheet
   - Header: company name, address/contact and title on fewer lines; summary block compressed into a two-column inline strip instead of a 70mm table.
   - Table: font 7.5px, padding 1px, line-height 1.1; remove the blank filler rows entirely.
   - Signatures + footer on one line, smaller.
   - Batch number shown as `#XXXX` short form, column 12mm.

4. Better auto-fit
   - Keep the existing scale-to-fit script but allow shrinking to 0.6 min and measure after fonts load, so wide material sets still land on one page.
   - Product column stays wide (48mm) with single-line ellipsis so names never wrap and inflate row height.

5. Excel export
   - Same unit-in-header and short-date treatment so the XLSX matches the print output. No change to totals logic.

## Technical notes

All edits are in `src/lib/batch-history-report.ts` (HTML/CSS renderer + XLSX builder), plus the `dateTime` formatting passed from `src/routes/_authenticated/production.batch-history.tsx`. No database or calculation changes — totals, estimated quantities and values stay exactly as today.
