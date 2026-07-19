import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Building2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { pageTitle } from "@/lib/company-settings";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/branches")({
  head: () => ({ meta: [{ title: pageTitle("Branches") }] }),
  component: Branches,
});

type Branch = { id: string; name: string; city: string | null; code: string | null };
type Stat = { monthSales: number; todaySales: number };

function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: rooms, error } = await sb
          .from("showrooms")
          .select("id,name,city,code")
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        if (cancelled) return;
        setBranches((rooms ?? []) as Branch[]);

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const { data: sales } = await sb
          .from("sales")
          .select("showroom_id,total,created_at")
          .gte("created_at", monthStart.toISOString());
        if (cancelled) return;
        const map: Record<string, Stat> = {};
        for (const s of (sales ?? []) as any[]) {
          const id = s.showroom_id ?? "unassigned";
          const t = Number(s.total ?? 0);
          if (!map[id]) map[id] = { monthSales: 0, todaySales: 0 };
          map[id].monthSales += t;
          if (new Date(s.created_at) >= todayStart) map[id].todaySales += t;
        }
        setStats(map);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Failed to load branches");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AppShell
      title="Branch Management"
      subtitle="Multi-branch operations · centralized governance"
      actions={
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
          <Plus className="size-4" /> Add Branch
        </button>
      }
    >
      {loading && (
        <div className="text-sm text-muted-foreground">Loading branches…</div>
      )}
      {!loading && branches.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No branches yet. Add one from Settings → Showrooms.
        </Card>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {branches.map((b) => {
          const s = stats[b.id] ?? { monthSales: 0, todaySales: 0 };
          return (
          <Card key={b.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center"><Building2 className="size-5" /></div>
                <div>
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.city ?? b.code ?? "—"}</div>
                </div>
              </div>
              <Badge tone="success">Active</Badge>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div><dt className="text-[10px] text-muted-foreground uppercase">Sales (mo)</dt><dd className="text-base font-semibold mt-0.5">৳{s.monthSales.toLocaleString()}</dd></div>
              <div><dt className="text-[10px] text-muted-foreground uppercase">Today</dt><dd className="text-base font-semibold mt-0.5">৳{s.todaySales.toLocaleString()}</dd></div>
            </dl>
          </Card>
          );
        })}
      </div>
    </AppShell>
  );
}