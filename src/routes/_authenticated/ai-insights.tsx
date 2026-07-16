import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Badge } from "@/components/app-shell";
import { Sparkles, TrendingUp, AlertCircle, Lightbulb } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-insights")({
  head: () => ({ meta: [{ title: "AI Insights · Crumb & Co." }] }),
  component: AIInsights,
});

type Point = { day: string; actual: number | null; predicted: number | null };
type Insight = { icon: LucideIcon; title: string; body: string };

function fmt(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function AIInsights() {
  const { currentShowroomId } = useShowroomScope();
  const [forecast, setForecast] = useState<Point[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [headline, setHeadline] = useState<string>("Gathering data…");
  const [confidence, setConfidence] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 27);
      since.setHours(0, 0, 0, 0);

      let salesQ = supabase
        .from("sales")
        .select("total, created_at, showroom_id")
        .gte("created_at", since.toISOString());
      if (currentShowroomId) salesQ = salesQ.eq("showroom_id", currentShowroomId);

      let itemsQ = supabase
        .from("sale_items")
        .select("product_name, qty, line_total, sale_id, sales!inner(created_at, showroom_id)")
        .gte("sales.created_at", since.toISOString());
      if (currentShowroomId) itemsQ = itemsQ.eq("sales.showroom_id", currentShowroomId);

      const [sales, items] = await Promise.all([salesQ, itemsQ]);
      if (cancelled) return;
      if (sales.error) toast.error(sales.error.message);

      // Bucket by day
      const byDay = new Map<string, number>();
      for (let i = 0; i < 28; i++) {
        const d = new Date(since);
        d.setDate(d.getDate() + i);
        byDay.set(d.toISOString().slice(0, 10), 0);
      }
      for (const s of sales.data ?? []) {
        const key = (s.created_at as string).slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + Number(s.total ?? 0));
      }
      const days = Array.from(byDay.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
      const actuals = days.map(([, v]) => v);

      // Simple 7-day moving average forecast
      const window = actuals.slice(-7);
      const avg = window.length ? window.reduce((s, v) => s + v, 0) / window.length : 0;

      const points: Point[] = days.slice(-14).map(([k, v]) => ({
        day: fmt(new Date(k)),
        actual: v,
        predicted: null,
      }));
      // Continuity anchor
      if (points.length) points[points.length - 1].predicted = points[points.length - 1].actual;
      for (let i = 1; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        points.push({ day: fmt(d), actual: null, predicted: Math.round(avg) });
      }
      setForecast(points);

      // Insights
      const list: Insight[] = [];
      const last7 = actuals.slice(-7).reduce((s, v) => s + v, 0);
      const prev7 = actuals.slice(-14, -7).reduce((s, v) => s + v, 0);
      if (prev7 > 0) {
        const change = ((last7 - prev7) / prev7) * 100;
        list.push({
          icon: TrendingUp,
          title: `Sales ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% week-over-week`,
          body: `Last 7 days: ৳${Math.round(last7).toLocaleString()} vs prior 7: ৳${Math.round(prev7).toLocaleString()}.`,
        });
      }

      // Best day of week
      const dow = [0, 0, 0, 0, 0, 0, 0];
      const dowN = [0, 0, 0, 0, 0, 0, 0];
      for (const [k, v] of days) {
        const wd = new Date(k).getDay();
        dow[wd] += v;
        dowN[wd] += 1;
      }
      const dowAvg = dow.map((s, i) => (dowN[i] ? s / dowN[i] : 0));
      const bestIdx = dowAvg.indexOf(Math.max(...dowAvg));
      if (dowAvg[bestIdx] > 0) {
        const name = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][bestIdx];
        list.push({
          icon: Lightbulb,
          title: `${name}s are your strongest day`,
          body: `Average ৳${Math.round(dowAvg[bestIdx]).toLocaleString()} in sales — plan production and staffing accordingly.`,
        });
      }

      // Top product
      if (!items.error) {
        const byProd = new Map<string, number>();
        for (const it of items.data ?? []) {
          const name = (it.product_name as string) ?? "Unknown";
          byProd.set(name, (byProd.get(name) ?? 0) + Number(it.qty ?? 0));
        }
        const top = [...byProd.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) {
          list.push({
            icon: AlertCircle,
            title: `${top[0]} is your bestseller`,
            body: `${top[1]} units sold in the last 28 days. Keep this line well-stocked.`,
          });
        }
      }

      setInsights(list);

      // Headline
      const daysWithSales = actuals.filter((v) => v > 0).length;
      setConfidence(Math.min(95, Math.round((daysWithSales / 28) * 100)));
      if (daysWithSales === 0) setHeadline("No sales in the last 28 days — insights will appear once you start selling.");
      else if (list.length && prev7 > 0) setHeadline(list[0].title);
      else setHeadline("Keep logging sales — richer insights unlock with more history.");

      setLoading(false);
    })().catch((e) => {
      if (!cancelled) {
        toast.error(e?.message ?? "Failed to load insights");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentShowroomId]);

  return (
    <AppShell title="AI Forecast & Insights" subtitle="Predictive analytics across sales, production, and inventory">
      <Card className="p-6 mb-5 bg-gradient-to-br from-primary/10 to-transparent border-primary/30">
        <div className="flex items-start gap-4">
          <div className="size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">This week's headline</h2>
              <Badge tone="primary">{confidence}% confidence</Badge>
            </div>
            <p className="text-sm mt-1.5 text-muted-foreground">
              {loading ? "Analyzing recent activity…" : headline}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-5">
          <h3 className="text-sm font-semibold">Sales · last 14 days + 7-day forecast</h3>
          <p className="text-xs text-muted-foreground">Dashed line is predicted (7-day moving average)</p>
          <div className="h-72 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="actual" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="predicted" stroke="var(--primary)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <div className="space-y-3">
          {insights.length === 0 && (
            <Card className="p-4 text-xs text-muted-foreground">
              {loading ? "Loading insights…" : "No insights yet — check back after a few days of activity."}
            </Card>
          )}
          {insights.map((it) => {
            const Icon = it.icon;
            return (
              <Card key={it.title} className="p-4">
                <div className="flex gap-3">
                  <div className="size-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{it.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{it.body}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}