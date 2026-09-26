-- Patch 36 — Speed up Batch History (idempotent). Run in the VPS SQL editor.
-- Batch History looks up ingredient/stock rows by ref_id (batch id). Without an
-- index Postgres scans the whole ledger and runs the RLS location check per row,
-- which hits the statement timeout and the page showed "cannot view Factory".
CREATE INDEX IF NOT EXISTS idx_raw_stock_ledger_ref ON public.raw_stock_ledger (ref_id, kind);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_ref ON public.stock_ledger (ref_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_kind_created ON public.stock_ledger (kind, created_at DESC) WHERE showroom_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_production_overheads_batch ON public.production_overheads (batch_id);
ANALYZE public.raw_stock_ledger;
ANALYZE public.stock_ledger;
