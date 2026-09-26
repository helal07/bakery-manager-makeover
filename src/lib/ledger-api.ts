import { api } from "@/lib/api-client";
import type { LedgerEntry } from "@/lib/ledger-math";

/** Customer / supplier statement from the Laravel API (already built server-side). */
export async function apiLedger(kind: "customer" | "supplier", id: string) {
  const [res, lookups] = await Promise.all([
    api.get<{ party: any; entries: LedgerEntry[] }>(`ledger/${kind}/${id}`),
    api.get<{ showrooms: { id: string; name: string }[] }>("lookups").catch(() => ({ showrooms: [] })),
  ]);
  const locations: { id: string | null; name: string }[] = [
    { id: null, name: "Factory" },
    ...(lookups.showrooms ?? []).map((r) => ({ id: r.id, name: r.name })),
  ];
  const entries = (res.entries ?? []).map((e) => ({
    ...e,
    debit: Number(e.debit) || 0,
    credit: Number(e.credit) || 0,
    balance: Number(e.balance) || 0,
  }));
  return { party: res.party, entries, locations };
}
