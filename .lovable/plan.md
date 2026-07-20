## লক্ষ্য
Production মডিউলটা এমনভাবে সাজানো যেন যেকোনো নতুন ইউজার ৩০ সেকেন্ডে বুঝে ফেলে — শুধু দুইটা কাজ: **রেসিপি বানাও**, তারপর **Produce চাপো**। বাকি সব (Work Order, QC, Wastage, Repurpose, Reports) "Advanced" ভাঁজে লুকানো থাকবে।

## নতুন Production Home layout

```text
┌─────────────────────────────────────────────┐
│  Production                                 │
│  Recipe বানান → Produce চাপুন → শেষ         │
├─────────────────────────────────────────────┤
│  ┌────────────┐   ┌────────────┐            │
│  │ 📖 Recipes │   │ 🏭 Produce │  ← বড় ২টা  │
│  │  & BOM     │   │  (1-click) │    tile    │
│  └────────────┘   └────────────┘            │
│                                             │
│  Recent batches (last 5) — inline preview  │
│                                             │
│  ▸ Advanced (collapsed)                     │
│     Work Orders · QC · Wastage · Repurpose  │
│     · Recipe Categories · Cost Report       │
│     · Consumption Report · Batches history  │
└─────────────────────────────────────────────┘
```

## নতুন "Produce" পেজ (`/production/produce`) — one-click flow

একটাই screen, একটাই form:

1. **Product dropdown** — শুধু যেসব product-এর recipe define করা আছে সেগুলোই দেখাবে (recipe না থাকলে disabled + "Set recipe first" link)।
2. **Batch quantity** input (default 1)।
3. Product select করলেই নিচে **auto preview**:
   - কী কী raw material লাগবে (qty × batch)
   - প্রতিটার current stock — সবুজ (enough) / লাল (short)
   - Total estimated cost
4. **[Produce Now]** — বড় primary বাটন। চাপলে:
   - Confirm dialog: "X batch of Y produce করবেন? Z raw material কাটা যাবে।"
   - Yes → existing `commit_production_batch` RPC কল → toast "✓ Produced" → form reset + recent batches list-এ instant append।
5. যদি কোনো raw material short হয়, Produce বাটন disabled + "Not enough: sugar 2kg short" red banner।

এতে Work Order/QC কিছুই লাগবে না — এক ক্লিকেই stock কাটা + finished stock যোগ।

## Recipes পেজ — minor polish
- উপরে বড় হেল্প ব্যানার: "একটা product-এর জন্য কোন raw material কতটুকু লাগে সেটা এখানে define করুন। এরপর Produce পেজ থেকে এক ক্লিকে batch বানাতে পারবেন।"
- প্রতিটা recipe card-এ "▶ Produce" shortcut বাটন — সরাসরি `/production/produce?product=ID` prefill।

## Advanced section behavior
- Production home-এ collapsed accordion, default বন্ধ।
- Expand করলে আগের ৮টা tile grid দেখাবে (Work Orders, QC, Wastage, Repurpose, Recipe Categories, Cost Report, Consumption Report, Batches history)।
- URLs / routes / permissions — সব unchanged, শুধু visibility চেঞ্জ।

## যে ফাইল বদলাবে / নতুন হবে
- **নতুন**: `src/routes/_authenticated/production.produce.tsx` — one-click Produce screen।
- **Rewrite**: `src/routes/_authenticated/production.index.tsx` — নতুন 2-tile + recent batches + collapsed Advanced।
- **Update**: `src/routes/_authenticated/recipes.tsx` — help banner + per-recipe "Produce" shortcut।
- **কোনো DB migration লাগবে না** — existing `commit_production_batch` RPC আর tables যথেষ্ট।

## যা অপরিবর্তিত
- Work Orders, QC, Wastage, Repurpose, Reports — কোড unchanged, শুধু home থেকে সরাসরি না দেখিয়ে Advanced-এ।
- RBAC permissions (`production.access`, `production.recipes.view` ইত্যাদি) — same।
- VPS-এ কিছু চালাতে হবে না।

Approve করলে implement শুরু করি।
