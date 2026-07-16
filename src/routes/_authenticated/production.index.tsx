import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
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
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/production/")({
  head: () => ({ meta: [{ title: "Production · Muzahid Food" }] }),
  component: ProductionHome,
});

const tiles = [
  { to: "/recipes", label: "Recipes & BOM", desc: "Define recipes and approve batches", icon: ChefHat },
  { to: "/production/recipe-categories", label: "Recipe Categories", desc: "Group recipes (Breads, Cakes…)", icon: Tag },
  { to: "/production/batches", label: "Production Batches", desc: "History of produced batches", icon: Factory },
  { to: "/production/work-orders", label: "Work Orders", desc: "Assign batches to staff", icon: ClipboardList },
  { to: "/production/wastage", label: "Wastage / Scrap Log", desc: "Record spoilage, deduct raw stock", icon: Trash2 },
  { to: "/production/qc", label: "Quality Check", desc: "Pass/fail per batch with notes", icon: ShieldCheck },
  { to: "/production/cost-report", label: "Production Cost Report", desc: "Batch cost & unit-cost trend", icon: BarChart3 },
  { to: "/production/consumption-report", label: "Raw Material Consumption", desc: "Usage by period / product", icon: Wheat },
] as const;

function ProductionHome() {
  return (
    <AppShell title="Production" subtitle="Recipes, batches, work orders, wastage, QC & reports">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="group">
            <Card className="p-5 hover:border-primary/60 transition">
              <div className="flex items-start gap-4">
                <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <t.icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.label}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">{t.desc}</div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
