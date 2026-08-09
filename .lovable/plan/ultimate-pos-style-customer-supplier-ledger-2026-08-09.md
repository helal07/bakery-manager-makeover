# Ultimate POS-style Customer & Supplier Ledger

## What you get

A redesigned ledger page that matches the reference screenshot layout:

- **Header block**: company name + address on the right (from company settings), a "To:" party block on the left with name, phone, email, address.
- **Filter bar**: date range (From / To), Business Location (All locations / per showroom), ledger format tabs (Format 1 = classic debit/credit table, Format 2 = grouped by invoice with payment rows), plus PDF/Print and CSV buttons.
- **Account Summary panel** (right, styled like the screenshot): for the selected range — Total invoice, Total paid; then **Overall Summary** — Total invoice, Total paid, **Balance due**.
- **Statement table**: Date, Reference No, Type (Sell / Payment / Return), Location, Payment Status (Paid / Partial / Due), Debit, Credit, Payment Method, Others — with running balance in the last row group and a totals footer.
- Caption line: "Showing all invoices and payments between {from} and {to}".
- Mobile: table scrolls horizontally; summary panel stacks under the header.
- Print stylesheet so the statement prints clean on A4 with header + summary + table only.

## Same page for suppliers

Add a supplier ledger route mirroring the customer one: purchases as debit, supplier payments and purchase returns as credit. A "Ledger" action is added to the supplier list row menu.

## Data correctness fix (confirmed bug)

The current page double-counts money. For this customer the DB shows 3 sales (total 1,490 / paid 1,060) and one payment row of 1,000 that is **linked to sale f5f7001d** — that same 1,000 is already inside `sales.paid`. The page adds both, so it shows Total paid 2,060 and a negative balance of -570 instead of Balance due 430.

Fix: credit is computed once —
- Debit = invoice total per sale.
- Credit = payment rows (sale-linked and standalone), plus any residual `sales.paid` not covered by recorded payment rows for that sale (legacy sales saved without a payment row).
- Balance due = total invoices − total credits, floored at 0 for the summary and shown signed (advance) when negative.

The same netting rule is applied to sale returns (credit) so returned amounts reduce the balance.

## Technical notes

- Files: rewrite `src/routes/_authenticated/crm.$id.ledger.tsx`; new `src/routes/_authenticated/suppliers.$id.ledger.tsx`; extract shared math into `src/lib/ledger-math.ts` (pure, unit-testable) with a small Vitest file covering the double-count case above.
- Reads: `sales`, `sale_items` count, `customer_payments`, `sale_returns` (customer side); `purchases`, `supplier_payments`, `purchase_returns` (supplier side); `showrooms` for the location filter; `company_settings` for the header.
- All queries stay scoped through the existing `scopeTo` / showroom-scope helpers so location isolation and RLS behaviour are unchanged.
- Permissions unchanged: existing `contacts.customers.ledger` gate for customers, `contacts.suppliers.view` for suppliers.
- No database migration required.
