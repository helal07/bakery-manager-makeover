
## লক্ষ্য
`Recipes` এবং `New Production` — দুইটাই একই workflow। এদের একসাথে করে **"Production Workbench"** বানাব (Sample B — Tabbed layout)। "New Production" submenu সরানো হবে।

---

## Final UI — Sample B (Tabbed Workbench)

```text
┌──────────────────────────────────────────────────────────────┐
│ Production Workbench                       [+ New Recipe]    │
├──────────────────────────────────────────────────────────────┤
│ Product ▾ [ 🍞 Butter Croissant (BC-001) ▾ ]   12 recipes    │
│                                                              │
│ ╭ Produce ─╮ ╭ Edit Recipe ╮ ╭ Batch history ╮               │
│ │                                                          │ │
│ │  Batch qty  [−] 5 [+]        Unit cost  ৳12.40           │ │
│ │  Showroom   Factory ▾        Batch cost ৳62.00           │ │
│ │                                                          │ │
│ │  Raw material preview                                    │ │
│ │  Material │ Need │ Stock │ Cost │ Status                 │ │
│ │  Flour    │1000g │5000g  │৳20   │  OK ✓                  │ │
│ │  Butter   │ 250g │ 100g  │৳30   │ SHORT ⚠  [Stock In]    │ │
│ │                                                          │ │
│ │           [ ▶  PRODUCE NOW  (৳62.00) ]                   │ │
│ ╰──────────────────────────────────────────────────────────╯ │
└──────────────────────────────────────────────────────────────┘
```

- **Product selector** — top of page. Searchable combobox (native `<select>` fallback) listing recipe-সহ product। URL param `?product=<id>` support থাকবে (deep-link)।
- **Tabs:**
  - **Produce** (default) — batch qty stepper, showroom selector, ingredient preview table, big Produce CTA, confirm dialog।
  - **Edit Recipe** — বর্তমান editor dialog-এর content inline; add/remove ingredient, validation (duplicate + zero qty)। Save/Delete buttons ভিতরে।
  - **Batch history** — এই product-এর last ~20 batches (`stock_ledger` kind=production filter), each row → Labels link।
- **Empty state** — কোনো recipe না থাকলে বড় card + "Create first recipe" button।

---

## Files

- **Rewrite** `src/routes/_authenticated/recipes.tsx` — tabbed workbench, `?product=` search param support, existing `commitProduction` / `saveRecipe` / validation reuse।
- **Rewrite** `src/routes/_authenticated/production.produce.tsx` — redirect-only:
  ```ts
  beforeLoad: ({ search }) => throw redirect({ to: "/recipes", search })
  ```
- **Edit** `src/components/app-shell.tsx` — production submenu থেকে "New Production" entry সরানো; "Recipes" label → **"Recipes & Production"**।
- **Edit** `src/routes/_authenticated/production.index.tsx` — dashboard-এর "New Production" quick action → "Open Workbench" (`/recipes`)।

---

## যা বদলাবে না
- Database, RPC (`commit_production_batch`), permissions (`production.recipes.view`, `production.batches`), Batches / Wastage / Cost / Consumption Report pages — সব untouched। কোনো migration লাগবে না।

Ready? "Approve plan" চাপলে build mode-এ implement শুরু করব।
