/**
 * Function tests against a REAL database.
 *
 * These verify the money-critical RPCs (production, stock, damaged goods,
 * invoice bundle, RBAC helpers). They are opt-in: without credentials the
 * whole file is skipped, so normal builds never depend on a database.
 *
 * Run against the self-hosted VPS:
 *   TEST_SUPABASE_URL=https://supabase.example.com \
 *   TEST_SUPABASE_SERVICE_KEY=<service role key> \
 *   bunx vitest run tests/db
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env["TEST_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
const KEY = process.env["TEST_SUPABASE_SERVICE_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
const enabled = Boolean(URL_ && KEY);

const suite = enabled ? describe : describe.skip;

const TAG = `vitest-${Date.now()}`;
const num = (v: unknown) => Number(v ?? 0);

suite("database functions", () => {
  let db: SupabaseClient;
  const created: { table: string; id: string }[] = [];
  let factoryId: string | null = null;
  let showroomId = "";
  let flourId = "";
  let sugarId = "";
  let productId = "";

  const track = (table: string, id: string) => created.push({ table, id });

  beforeAll(async () => {
    db = createClient(URL_!, KEY!, { auth: { persistSession: false } });

    const { data: factory } = await db
      .from("showrooms")
      .select("id")
      .eq("is_factory", true)
      .limit(1)
      .maybeSingle();
    factoryId = factory?.id ?? null;

    const { data: sr, error: srErr } = await db
      .from("showrooms")
      .insert({ name: `${TAG} showroom`, code: TAG.slice(-8), is_active: true })
      .select("id")
      .single();
    expect(srErr).toBeNull();
    showroomId = sr!.id;
    track("showrooms", showroomId);

    const mats = await db
      .from("raw_materials")
      .insert([
        { name: `${TAG} flour`, unit: "kg", cost: 60, min_stock: 0, is_active: true },
        { name: `${TAG} sugar`, unit: "kg", cost: 120, min_stock: 0, is_active: true },
      ])
      .select("id,name");
    expect(mats.error).toBeNull();
    flourId = mats.data!.find((m: any) => m.name.endsWith("flour"))!.id;
    sugarId = mats.data!.find((m: any) => m.name.endsWith("sugar"))!.id;
    track("raw_materials", flourId);
    track("raw_materials", sugarId);

    const prod = await db
      .from("products")
      .insert({
        name: `${TAG} bun`,
        sku: `${TAG}-BUN`,
        unit: "pcs",
        price: 25,
        cost: 15,
        threshold: 0,
        is_active: true,
      })
      .select("id")
      .single();
    expect(prod.error).toBeNull();
    productId = prod.data!.id;
    track("products", productId);
  });

  afterAll(async () => {
    if (!db) return;
    // Children first, then the fixtures themselves.
    for (const t of [
      "sale_payments",
      "sale_items",
      "damaged_ledger",
      "damaged_stock",
      "wastage_log",
      "stock_ledger",
      "raw_stock_ledger",
      "production_overheads",
      "product_stock",
      "raw_material_stock",
    ]) {
      await db.from(t).delete().eq("product_id", productId);
    }
    for (const t of ["raw_stock_ledger", "raw_material_stock"]) {
      await db.from(t).delete().in("material_id", [flourId, sugarId]);
    }
    await db.from("sale_payments").delete().eq("reference", TAG);
    await db.from("sales").delete().eq("external_ref", TAG);
    for (const c of [...created].reverse()) {
      await db.from(c.table).delete().eq("id", c.id);
    }
  });

  const rawOnHand = async (materialId: string) => {
    const q = db.from("raw_material_stock").select("quantity").eq("material_id", materialId);
    const { data } = factoryId ? await q.eq("showroom_id", factoryId) : await q.is("showroom_id", null);
    return (data ?? []).reduce((s: number, r: any) => s + num(r.quantity), 0);
  };
  const productOnHand = async (showroom: string | null) => {
    const q = db.from("product_stock").select("quantity").eq("product_id", productId);
    const { data } = showroom ? await q.eq("showroom_id", showroom) : await q.is("showroom_id", null);
    return (data ?? []).reduce((s: number, r: any) => s + num(r.quantity), 0);
  };

  it("commit_raw_stock_movement adds stock and writes a ledger row", async () => {
    const before = await rawOnHand(flourId);
    const { data, error } = await db.rpc("commit_raw_stock_movement", {
      _material_id: flourId,
      _showroom_id: factoryId,
      _qty: 100,
      _kind: "purchase",
      _ref_type: "test",
      _ref_id: null,
      _note: TAG,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(await rawOnHand(flourId)).toBeCloseTo(before + 100, 4);

    const { data: ledger } = await db
      .from("raw_stock_ledger")
      .select("qty,note")
      .eq("material_id", flourId)
      .eq("note", TAG);
    expect((ledger ?? []).length).toBeGreaterThan(0);
  });

  it("commit_raw_stock_movement deducts on negative qty", async () => {
    const before = await rawOnHand(flourId);
    const { error } = await db.rpc("commit_raw_stock_movement", {
      _material_id: flourId,
      _showroom_id: factoryId,
      _qty: -10,
      _kind: "consume",
      _ref_type: "test",
      _ref_id: null,
      _note: TAG,
    });
    expect(error).toBeNull();
    expect(await rawOnHand(flourId)).toBeCloseTo(before - 10, 4);
  });

  it("commit_production_batch consumes materials, adds finished stock and records overheads", async () => {
    await db.rpc("commit_raw_stock_movement", {
      _material_id: sugarId,
      _showroom_id: factoryId,
      _qty: 50,
      _kind: "purchase",
      _ref_type: "test",
      _ref_id: null,
      _note: TAG,
    });

    const flourBefore = await rawOnHand(flourId);
    const sugarBefore = await rawOnHand(sugarId);
    const finishedBefore = await productOnHand(factoryId);

    const { data: batchId, error } = await db.rpc("commit_production_batch", {
      _product_id: productId,
      _showroom_id: factoryId,
      _batch: 20,
      _ingredients: [
        { material_id: flourId, qty: 10 },
        { material_id: sugarId, qty: 4 },
      ],
      _overheads: [],
    });
    expect(error).toBeNull();
    expect(batchId).toBeTruthy();

    expect(await rawOnHand(flourId)).toBeCloseTo(flourBefore - 10, 4);
    expect(await rawOnHand(sugarId)).toBeCloseTo(sugarBefore - 4, 4);
    expect(await productOnHand(factoryId)).toBeCloseTo(finishedBefore + 20, 4);

    const { data: ledger } = await db
      .from("stock_ledger")
      .select("qty,kind")
      .eq("product_id", productId)
      .eq("ref_id", batchId as string);
    expect((ledger ?? []).length).toBeGreaterThan(0);
  });

  it("commit_production_batch is repeatable and keeps stock consistent", async () => {
    const before = await productOnHand(factoryId);
    const { error } = await db.rpc("commit_production_batch", {
      _product_id: productId,
      _showroom_id: factoryId,
      _batch: 5,
      _ingredients: [{ material_id: flourId, qty: 2 }],
      _overheads: [],
    });
    expect(error).toBeNull();
    expect(await productOnHand(factoryId)).toBeCloseTo(before + 5, 4);
  });

  it("commit_stock_movement moves finished goods to a showroom", async () => {
    const before = await productOnHand(showroomId);
    const { error } = await db.rpc("commit_stock_movement", {
      _product_id: productId,
      _showroom_id: showroomId,
      _qty: 10,
      _kind: "transfer_in",
      _ref_type: "test",
      _ref_id: null,
      _note: TAG,
    });
    expect(error).toBeNull();
    expect(await productOnHand(showroomId)).toBeCloseTo(before + 10, 4);
  });

  it("log_finished_product_wastage records wastage and reduces stock", async () => {
    const before = await productOnHand(showroomId);
    const { data, error } = await db.rpc("log_finished_product_wastage", {
      _product_id: productId,
      _showroom_id: showroomId,
      _qty: 2,
      _reason: "damaged",
      _note: TAG,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(await productOnHand(showroomId)).toBeCloseTo(before - 2, 4);

    const { data: log } = await db
      .from("wastage_log")
      .select("qty")
      .eq("product_id", productId)
      .eq("showroom_id", showroomId);
    expect((log ?? []).length).toBeGreaterThan(0);
  });

  it("commit_damaged_movement tracks a damaged pool", async () => {
    const { error } = await db.rpc("commit_damaged_movement", {
      _product_id: productId,
      _showroom_id: showroomId,
      _qty: 3,
      _kind: "in",
      _ref_type: "test",
      _ref_id: null,
      _note: TAG,
    });
    expect(error).toBeNull();
    const { data } = await db
      .from("damaged_stock")
      .select("quantity")
      .eq("product_id", productId)
      .eq("showroom_id", showroomId);
    expect((data ?? []).reduce((s: number, r: any) => s + num(r.quantity), 0)).toBeGreaterThanOrEqual(3);
  });

  it("commit_damaged_sale sells from the damaged pool at a custom price", async () => {
    const { data, error } = await db.rpc("commit_damaged_sale", {
      _product_id: productId,
      _showroom_id: showroomId,
      _qty: 1,
      _unit_price: 5,
      _customer_name: `${TAG} buyer`,
      _note: TAG,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const { data: led } = await db
      .from("damaged_ledger")
      .select("qty,sale_amount,customer_name")
      .eq("product_id", productId)
      .eq("customer_name", `${TAG} buyer`);
    expect((led ?? []).length).toBe(1);
    expect(num(led![0].sale_amount)).toBeCloseTo(5, 4);
  });

  it("get_invoice_bundle returns the sale, its items, payments and header", async () => {
    const sale = await db
      .from("sales")
      .insert({
        external_ref: TAG,
        showroom_id: showroomId,
        customer_name: `${TAG} customer`,
        customer_phone: "01711000111",
        subtotal: 250,
        discount: 0,
        tax: 0,
        shipping: 0,
        total: 250,
        paid: 150,
        due: 100,
        payment_mode: "partial",
      })
      .select("id")
      .single();
    expect(sale.error).toBeNull();
    const saleId = sale.data!.id;

    await db.from("sale_items").insert({
      sale_id: saleId,
      product_id: productId,
      product_name: `${TAG} bun`,
      qty: 10,
      unit_price: 25,
      line_total: 250,
    });
    await db.from("sale_payments").insert({
      sale_id: saleId,
      method: "cash",
      amount: 150,
      reference: TAG,
    });

    const { data, error } = await db.rpc("get_invoice_bundle", { _sale_id: saleId });
    expect(error).toBeNull();
    const bundle = data as any;
    expect(bundle.sale.id).toBe(saleId);
    expect(num(bundle.sale.total)).toBe(250);
    expect(bundle.items).toHaveLength(1);
    expect(num(bundle.items[0].qty)).toBe(10);
    expect(bundle.payments).toHaveLength(1);
    expect(num(bundle.payments[0].amount)).toBe(150);
    expect(bundle.showroom?.id).toBe(showroomId);
    expect(num(bundle.previous_due)).toBeGreaterThanOrEqual(0);

    await db.from("sales").delete().eq("id", saleId);
  });

  it("get_invoice_bundle returns null for an unknown sale", async () => {
    const { data, error } = await db.rpc("get_invoice_bundle", {
      _sale_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("has_role answers false for a random user", async () => {
    const { data, error } = await db.rpc("has_role", {
      _user_id: "00000000-0000-0000-0000-000000000000",
      _role: "admin",
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("user_has_showroom_access denies an unknown user", async () => {
    const { data, error } = await db.rpc("user_has_showroom_access", {
      _user: "00000000-0000-0000-0000-000000000000",
      _showroom: showroomId,
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("anon cannot read customers (RLS is on)", async () => {
    const anonKey = process.env["TEST_SUPABASE_ANON_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!anonKey) return;
    const anon = createClient(URL_!, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon.from("customers").select("id").limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

if (!enabled) {
  // Visible marker so a skipped run is obvious in CI output.
  // eslint-disable-next-line no-console
  console.warn(
    "[tests/db] skipped — set TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_KEY to run database function tests",
  );
}
