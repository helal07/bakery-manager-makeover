import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import {
  ChefHat,
  Factory,
  ClipboardList,
  Trash2,
  ShieldCheck,
  Tag,
  BarChart3,
  Wheat,
  ArrowRight,
  ChevronDown,
  History,
  Recycle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/production/")({
  head: () => ({ meta: [{ title: pageTitle("Production") }] }),
  component: ProductionHome,
});

const primary = [
  {
    to: "/recipes",
    label: "Recipes & BOM",
    desc: "প্রতিটি product-এর জন্য raw material define করুন",
    icon: ChefHat,
    step: "1",
  },
  {
    to: "/production/produce",
    label: "Produce",
    desc: "এক ক্লিকে batch বানান — stock auto-deduct",
    icon: Factory,
    step: "2",
  },
] as const;

const advanced = [
  { to: "/production/wastage", label: "Wastage / Scrap Log", desc: "Spoilage record", icon: Trash2 },
  { to: "/production/repurpose", label: "Repurpose", desc: "Damaged → new product", icon: Recycle },
  { to: "/production/batches", label: "Batch History", desc: "সমস্ত batch record", icon: History },
  { to: "/production/cost-report", label: "Cost Report", desc: "Batch cost trend", icon: BarChart3 },
  { to: "/production/consumption-report", label: "Consumption Report", desc: "Raw material usage", icon: Wheat },
] as const;

type Recent = { id: string; product: string; qty: number; date: string };

function ProductionHome() {
  const [recent, setRecent] = useState<Recent[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("stock_ledger")
        .select("id, qty, created_at, products(name)")
        .eq("kind", "production")
        .is("showroom_id", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (cancelled) return;
      setRecent(
        (data ?? []).map((r: any) => ({
          id: (r.id as string).slice(0, 8).toUpperCase(),
          product: r.products?.name ?? "—",
          qty: Number(r.qty ?? 0),
          date: (r.created_at as string).slice(0, 10),
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell
      title="Production"
      subtitle="Recipe বানান → Produce চাপুন → শেষ"
    >
      {/* 2 primary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {primary.map((t) => (
          <Link key={t.to} to={t.to} className="group">
            <Card className="p-6 hover:border-primary/60 transition h-full">
              <div className="flex items-start gap-4">
                <div className="size-14 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0 relative">
                  <t.icon className="size-6" />
                  <span className="absolute -top-1.5 -left-1.5 size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                    {t.step}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold">{t.label}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition mt-1" />
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent batches */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recent batches</h3>
          </div>
          <Link to="/production/batches" className="text-xs text-primary hover:underline">
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            এখনো কোনো batch produce হয়নি।{" "}
            <Link to="/production/produce" className="text-primary hover:underline">
              প্রথম batch বানান
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.product}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.id} · {r.date}</div>
                </div>
                <Badge tone="success">+{r.qty}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Advanced (collapsed) */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition"
        >
          <div className="text-sm font-medium">Advanced</div>
          <ChevronDown className={`size-4 text-muted-foreground transition ${showAdvanced ? "rotate-180" : ""}`} />
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 border-t border-border bg-muted/20">
            {advanced.map((t) => (
              <Link key={t.to} to={t.to} className="group">
                <Card className="p-4 hover:border-primary/60 transition bg-background">
                  <div className="flex items-start gap-3">
                    <div className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                      <t.icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
