#!/usr/bin/env node
/**
 * Capacity / load check for the self-hosted deployment.
 *
 * Creates N synthetic sales (header + items + payment) against a throwaway
 * showroom, measures write throughput, then times the heaviest read paths the
 * app uses. Cleans everything up afterwards.
 *
 * Usage:
 *   TEST_SUPABASE_URL=https://supabase.example.com \
 *   TEST_SUPABASE_SERVICE_KEY=<service role key> \
 *   node scripts/load-check.mjs --sales=100 --items=4
 */
import { createClient } from "@supabase/supabase-js";

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : dflt;
};

const URL_ = process.env.TEST_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  console.error("Set TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_KEY first.");
  process.exit(1);
}

const SALES = arg("sales", 100);
const ITEMS = arg("items", 4);
const CONCURRENCY = arg("concurrency", 8);
const TAG = `loadcheck-${Date.now()}`;

const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const ms = (t) => `${t.toFixed(0)} ms`;
const time = async (label, fn) => {
  const t0 = performance.now();
  const out = await fn();
  const dt = performance.now() - t0;
  console.log(`  ${label.padEnd(34)} ${ms(dt).padStart(10)}`);
  return { dt, out };
};

async function pool(items, worker, size) {
  let i = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

async function main() {
  console.log(`\nLoad check against ${URL_}`);
  console.log(`Sales: ${SALES} · items/sale: ${ITEMS} · concurrency: ${CONCURRENCY}\n`);

  // --- fixtures -----------------------------------------------------------
  const { data: showroom, error: srErr } = await db
    .from("showrooms")
    .insert({ name: `${TAG} showroom`, code: TAG.slice(-8), is_active: true })
    .select("id")
    .single();
  if (srErr) throw srErr;

  const { data: products, error: pErr } = await db
    .from("products")
    .select("id,name,sku,price")
    .eq("is_active", true)
    .limit(Math.max(ITEMS, 10));
  if (pErr) throw pErr;
  if (!products.length) throw new Error("No active products to sell — seed products first.");

  // --- writes -------------------------------------------------------------
  console.log("Writes");
  const t0 = performance.now();
  let failures = 0;
  await pool(
    Array.from({ length: SALES }, (_, i) => i),
    async (i) => {
      const lines = Array.from({ length: ITEMS }, (_, k) => products[(i + k) % products.length]);
      const subtotal = lines.reduce((s, p) => s + Number(p.price || 0) * 2, 0);
      const { data: sale, error } = await db
        .from("sales")
        .insert({
          external_ref: TAG,
          showroom_id: showroom.id,
          customer_name: `${TAG} customer ${i}`,
          customer_phone: `0170000${String(i).padStart(4, "0")}`,
          subtotal,
          discount: 0,
          tax: 0,
          shipping: 0,
          total: subtotal,
          paid: subtotal,
          due: 0,
          payment_mode: "cash",
        })
        .select("id")
        .single();
      if (error) {
        failures++;
        return;
      }
      const itemRows = lines.map((p) => ({
        sale_id: sale.id,
        product_id: p.id,
        product_name: p.name,
        product_sku: p.sku,
        qty: 2,
        unit_price: Number(p.price || 0),
        line_total: Number(p.price || 0) * 2,
      }));
      const [{ error: iErr }, { error: payErr }] = await Promise.all([
        db.from("sale_items").insert(itemRows),
        db.from("sale_payments").insert({ sale_id: sale.id, method: "cash", amount: subtotal, reference: TAG }),
      ]);
      if (iErr || payErr) failures++;
    },
    CONCURRENCY,
  );
  const writeMs = performance.now() - t0;
  const perSale = writeMs / SALES;
  console.log(`  ${String(SALES).padStart(4)} sales written in ${ms(writeMs)}`);
  console.log(`  avg per invoice (header+items+payment) ${ms(perSale)}`);
  console.log(`  throughput ≈ ${(1000 / perSale).toFixed(1)} invoices/sec at concurrency ${CONCURRENCY}`);
  if (failures) console.log(`  failures: ${failures}`);

  // --- reads --------------------------------------------------------------
  const today = new Date();
  const from = new Date(today.getTime() - 30 * 86400_000).toISOString();
  const to = new Date().toISOString();

  console.log("\nRead paths (the queries the app's heaviest pages run)");
  await time("POS product list", () =>
    db.from("products").select("id,name,sku,price,unit,category_id,image_url").eq("is_active", true).limit(500),
  );
  await time("POS on-hand stock", () =>
    db.from("product_stock").select("product_id,quantity").eq("showroom_id", showroom.id),
  );
  await time("Sales history (30d)", () =>
    db.from("sales").select("id,external_ref,total,paid,due,created_at,customer_name").gte("created_at", from).lte("created_at", to).order("created_at", { ascending: false }).limit(200),
  );
  await time("Sales + items join (30d)", () =>
    db.from("sales").select("id,total,sale_items(qty,line_total,product_name)").gte("created_at", from).limit(200),
  );
  await time("Daily register (stock ledger)", () =>
    db.from("stock_ledger").select("product_id,qty,kind,created_at").gte("created_at", from).limit(1000),
  );
  await time("Production overheads (30d)", () =>
    db.from("production_overheads").select("batch_id,category_id,amount,created_at").gte("created_at", from).limit(1000),
  );
  await time("Raw consumption (30d)", () =>
    db.from("raw_stock_ledger").select("material_id,qty,kind,created_at").gte("created_at", from).limit(1000),
  );
  await time("Customer payments (30d)", () =>
    db.from("customer_payments").select("id,amount,paid_on,customer_name").gte("created_at", from).limit(500),
  );

  const { data: anySale } = await db.from("sales").select("id").eq("external_ref", TAG).limit(1);
  if (anySale?.length) {
    await time("get_invoice_bundle RPC", () => db.rpc("get_invoice_bundle", { _sale_id: anySale[0].id }));
  }

  // --- cleanup ------------------------------------------------------------
  console.log("\nCleanup");
  const { data: mine } = await db.from("sales").select("id").eq("external_ref", TAG);
  const ids = (mine ?? []).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    await db.from("sale_payments").delete().in("sale_id", chunk);
    await db.from("sale_items").delete().in("sale_id", chunk);
    await db.from("sales").delete().in("id", chunk);
  }
  await db.from("showrooms").delete().eq("id", showroom.id);
  console.log(`  removed ${ids.length} synthetic sales and the test showroom\n`);

  const daily = (86_400_000 / perSale).toFixed(0);
  console.log("Verdict");
  console.log(`  At this write speed the database could absorb roughly ${daily} invoices/day`);
  console.log(`  if it did nothing else. Compare with your real target volume.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
