import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { Boxes, ScanBarcode, ShoppingBag, Wallet, ArrowRight, ReceiptText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({ meta: [{ title: "Reports · Muzahid Food" }] }),
  component: ReportsIndex,
});

const tiles = [
  { to: "/reports/stock", label: "Stock Reports", desc: "Product & raw material stock value", icon: Boxes },
  { to: "/reports/sales", label: "Sales Reports", desc: "Revenue, payments and branches", icon: ScanBarcode },
  { to: "/reports/purchase", label: "Purchase Reports", desc: "Supplier spend and categories", icon: ShoppingBag },
  { to: "/reports/ledgers", label: "Payment & Return Ledger", desc: "Customer, supplier and return movements", icon: ReceiptText },
  { to: "/reports/expenses", label: "Expense Reports", desc: "Category-wise expense analysis", icon: Wallet },
] as const;

function ReportsIndex() {
  return (
    <AppShell title="Reports & Analytics" subtitle="Choose a report to view with filters">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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