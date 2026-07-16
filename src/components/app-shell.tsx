import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Menu, X, Store, Factory } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { getCompany, defaultCompany, type CompanySettings } from "@/lib/company-settings";
import { getProfile, type UserProfile } from "@/lib/profile-settings";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  ScanBarcode,
  ChefHat,
  Users,
  Wheat,
  Package,
  Receipt,
  UserCog,
  BarChart3,
  Settings,
  ShoppingBag,
  ChevronDown,
  Plus,
  List,
  Undo2,
  Contact as ContactIcon,
  Truck,
  Tag,
  Boxes,
  Layers,
  Wallet,
  ShieldCheck,
  ArrowRightLeft,
  ReceiptText,
} from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: any;
  children?: { to: string; label: string; icon: any; hash?: string }[];
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        to: "/sales",
        label: "Sales",
        icon: ScanBarcode,
        children: [
          { to: "/pos", label: "Add Sale", icon: Plus },
          { to: "/sales/list", label: "Sale List", icon: List },
          { to: "/sales/return", label: "Return Sale", icon: Undo2 },
          { to: "/sales/payments", label: "Customer Payments", icon: Wallet },
        ],
      },
      {
        to: "/contact",
        label: "Contact",
        icon: ContactIcon,
        children: [
          { to: "/crm", label: "Customer", icon: Users },
          { to: "/customer-groups", label: "Customer Group", icon: Users },
          { to: "/suppliers", label: "Supplier", icon: Truck },
        ],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        to: "/products",
        label: "Products",
        icon: Package,
        children: [
          { to: "/products/new", label: "Add Product", icon: Plus },
          { to: "/products", label: "List Products", icon: List },
          { to: "/products/categories", label: "Add Category", icon: Plus, hash: "new" },
          { to: "/products/categories", label: "List Categories", icon: Tag },
          { to: "/products/units", label: "Units", icon: Tag },
          { to: "/products/selling-price-groups", label: "Selling Price Groups", icon: Tag },
          { to: "/product-stock", label: "Product Stock", icon: Layers },
        ],
      },
      {
        to: "/production",
        label: "Production",
        icon: Factory,
        children: [
          { to: "/production", label: "Dashboard", icon: LayoutDashboard },
          
          { to: "/raw-materials", label: "Raw Materials", icon: Wheat },
          { to: "/raw-material-stock", label: "Raw Material Stock", icon: Layers },
          { to: "/recipes", label: "Recipes & BOM", icon: ChefHat },
          { to: "/production/recipe-categories", label: "Recipe Categories", icon: Tag },
          { to: "/production/batches", label: "Production Batches", icon: Factory },
          { to: "/production/work-orders", label: "Work Orders", icon: List },
          { to: "/production/wastage", label: "Wastage Log", icon: Undo2 },
          { to: "/production/qc", label: "Quality Check", icon: ShieldCheck },
          { to: "/production/cost-report", label: "Cost Report", icon: BarChart3 },
          { to: "/production/consumption-report", label: "Consumption Report", icon: Wheat },
        ],
      },
      { to: "/transfers", label: "Transfers", icon: ArrowRightLeft },
      { to: "/sales/history", label: "Sales History", icon: Receipt },
    ],
  },
  {
    label: "Supply Chain",
    items: [
      {
        to: "/purchasing",
        label: "Purchase",
        icon: ShoppingBag,
        children: [
          { to: "/purchasing/new", label: "Add Purchase", icon: Plus },
          { to: "/purchasing/list", label: "Purchase List", icon: List },
          { to: "/purchasing/categories", label: "Purchase Category", icon: Tag },
          { to: "/purchasing/returns", label: "Purchase Returns", icon: Undo2 },
          { to: "/purchasing/payments", label: "Supplier Payments", icon: Wallet },
        ],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        to: "/expenses",
        label: "Expenses",
        icon: Receipt,
        children: [
          { to: "/expenses/new", label: "Add Expense", icon: Plus },
          { to: "/expenses/list", label: "List Expenses", icon: List },
          { to: "/expenses/categories", label: "Expense Categories", icon: Tag },
          { to: "/expenses/report", label: "Expense Report", icon: BarChart3 },
        ],
      },
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
        children: [
          { to: "/reports/stock", label: "Stock Reports", icon: Boxes },
          { to: "/reports/sales", label: "Sales Reports", icon: ScanBarcode },
          { to: "/reports/purchase", label: "Purchase Reports", icon: ShoppingBag },
          { to: "/reports/ledgers", label: "Payment & Return Ledger", icon: ReceiptText },
          { to: "/reports/expenses", label: "Expense Reports", icon: Wallet },
        ],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/employees", label: "Teams & Roles", icon: UserCog },
      {
        to: "/settings",
        label: "Settings",
        icon: Settings,
        children: [
          { to: "/settings", label: "General", icon: Settings },
          { to: "/settings/showrooms", label: "Showrooms", icon: ShoppingBag },
          { to: "/settings/access", label: "Access Control", icon: ShieldCheck },
          { to: "/settings/landing", label: "Landing Page", icon: LayoutDashboard },
        ],
      },
    ],
  },
];

export function AppShell({ children, title, subtitle, actions }: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash ?? "" });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanySettings>(defaultCompany);

  useEffect(() => {
    let mounted = true;
    const load = () => getCompany().then((c) => { if (mounted) setCompany(c); }).catch(() => {});
    load();
    const handler = () => load();
    window.addEventListener("company-settings-updated", handler);
    return () => { mounted = false; window.removeEventListener("company-settings-updated", handler); };
  }, []);

  useEffect(() => {
    for (const g of navGroups) {
      for (const it of g.items) {
        if (it.children?.some((c) => pathname.startsWith(c.to))) {
          setOpenMenu(it.to);
          return;
        }
      }
    }
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity duration-300",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transform-gpu transition-transform duration-300 ease-in-out will-change-transform md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-sidebar-border">
          <div className="size-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center overflow-hidden">
            {company.logoDataUrl ? (
              <img src={company.logoDataUrl} alt="" className="size-full object-cover" />
            ) : (
              <Wheat className="size-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">
              {company.name || defaultCompany.name}
            </div>
            <div className="text-[11px] text-sidebar-foreground/60 truncate">
              {company.tagline || company.address || ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {navGroups.map((g) => (
            <div key={g.label}>
              <div className="px-3 pb-1.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/45 font-semibold">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavEntry
                    key={n.to}
                    item={n}
                    pathname={pathname}
                    hash={hash}
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <UserMenu />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Page header */}
        <div className="px-4 md:px-8 pt-5 md:pt-7 pb-4 flex flex-wrap items-end justify-between gap-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-md text-foreground/70 hover:bg-accent"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight truncate">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ShowroomSwitcher />
            {actions}
          </div>
        </div>

        <main className="flex-1 px-4 md:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}

function NavEntry({ item, pathname, hash, openMenu, setOpenMenu }: {
  item: NavItem;
  pathname: string;
  hash: string;
  openMenu: string | null;
  setOpenMenu: (v: string | null) => void;
}) {
  const Icon = item.icon;
  const childActive = item.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + "/"));
  const selfActive = item.to === "/dashboard" ? pathname === "/dashboard" : pathname === item.to;
  const open = openMenu === item.to;

  if (!item.children) {
    const active = item.to === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.to);
    return (
      <Link
        to={item.to}
        className={cn(
          "flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4" />
        {item.label}
      </Link>
    );
  }

  const currentHash = (hash || "").replace(/^#/, "");
  // Determine the single "best" active child: exact path + hash match wins over path-only match.
  const activeKey = (() => {
    const exact = item.children.find((c) => pathname === c.to && (c.hash ?? "") === currentHash);
    if (exact) return `${exact.to}#${exact.hash ?? ""}`;
    const pathOnly = item.children.find((c) => pathname === c.to && !c.hash);
    if (pathOnly) return `${pathOnly.to}#`;
    const nested = item.children.find((c) => pathname.startsWith(c.to + "/") && !c.hash);
    if (nested) return `${nested.to}#`;
    return null;
  })();

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpenMenu(open ? null : item.to)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors",
          selfActive || childActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100 mt-0.5" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-5 pl-3 border-l border-sidebar-border space-y-0.5">
          {item.children.map((c) => {
            const CIcon = c.icon;
            const key = `${c.to}#${c.hash ?? ""}`;
            const active = key === activeKey;
            return (
              <Link
                key={`${c.to}#${c.hash ?? ""}`}
                to={c.to}
                hash={c.hash}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <CIcon className="size-3.5" />
                {c.label}
              </Link>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
  children: ReactNode;
}) {
  const map = {
    neutral: "bg-muted text-muted-foreground border-border",
    success: "bg-[color:var(--success)]/12 text-[color:var(--success)] border-[color:var(--success)]/25",
    warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning-foreground)] border-[color:var(--warning)]/40",
    danger: "bg-destructive/10 text-destructive border-destructive/25",
    primary: "bg-primary/10 text-primary border-primary/25",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", map[tone])}>
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card shadow-sm", className)}>{children}</div>
  );
}

function ShowroomSwitcher() {
  const { loading, showrooms, hasGlobalAccess, currentShowroomId, setCurrentShowroomId } = useShowroomScope();
  if (loading) return null;
  if (!hasGlobalAccess && showrooms.length <= 1) return null;
  const value = currentShowroomId ?? "__all__";
  return (
    <Select
      value={value}
      onValueChange={(v) => setCurrentShowroomId(v === "__all__" ? null : v)}
    >
      <SelectTrigger className="h-9 w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {hasGlobalAccess && (
          <SelectItem value="__all__">
            <span className="inline-flex items-center gap-2"><Factory className="size-3.5" /> All / Factory</span>
          </SelectItem>
        )}
        {showrooms.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="inline-flex items-center gap-2"><Store className="size-3.5" /> {s.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted || !data.user) return;
      setEmail(data.user.email ?? "");
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      if (mounted && roles && roles.length) setRole(roles[0].role);
    })();
    const loadProfile = () => getProfile().then((p) => { if (mounted) setProfile(p); }).catch(() => {});
    loadProfile();
    const handler = () => loadProfile();
    window.addEventListener("user-profile-updated", handler);
    return () => { mounted = false; window.removeEventListener("user-profile-updated", handler); };
  }, []);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const displayName = profile?.name || email || "Signed in";
  const initials = (profile?.name || email || "··")
    .split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "··";

  return (
    <div className="m-3 p-3 rounded-lg bg-sidebar-accent/60 border border-sidebar-border">
      <div className="flex items-center gap-2.5">
        <Link
          to="/profile"
          className="flex items-center gap-2.5 min-w-0 flex-1 rounded-md -m-1 p-1 hover:bg-sidebar-accent transition"
          title="Open profile"
        >
          <div className="size-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center text-xs font-semibold overflow-hidden">
            {profile?.avatarDataUrl
              ? <img src={profile.avatarDataUrl} alt="" className="size-full object-cover" />
              : initials}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-sm font-medium truncate">{displayName}</div>
            <div className="text-[11px] text-sidebar-foreground/60 capitalize truncate">{role || "—"}</div>
          </div>
        </Link>
        <button onClick={signOut} title="Sign out"
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}