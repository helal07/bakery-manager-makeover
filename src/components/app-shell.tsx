import { Link, useRouterState, useNavigate, Outlet } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { LogOut, Menu, X, Store, Factory } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { usePermissions } from "@/hooks/use-permissions";
import { getCompany, defaultCompany, getCachedCompany, type CompanySettings } from "@/lib/company-settings";
import { getProfile, getCachedProfile, type UserProfile } from "@/lib/profile-settings";
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
  Play,
} from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type NavChild = { to: string; label: string; icon: any; hash?: string; permission?: string };
type NavItem = {
  to: string;
  label: string;
  icon: any;
  permission?: string;
  children?: NavChild[];
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.access" },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        to: "/sales",
        label: "Sales",
        icon: ScanBarcode,
        permission: "sales.view",
        children: [
          { to: "/pos", label: "Add Sale", icon: Plus, permission: "pos.access" },
          { to: "/sales/list", label: "Sale List", icon: List, permission: "sales.view" },
          { to: "/sales/return", label: "Return Sale", icon: Undo2, permission: "sales.return" },
          { to: "/sales/payments", label: "Customer Payments", icon: Wallet, permission: "sales.payments" },
        ],
      },
      {
        to: "/contact",
        label: "Contact",
        icon: ContactIcon,
        children: [
          { to: "/crm", label: "Customer", icon: Users, permission: "contacts.customers.view" },
          { to: "/customer-groups", label: "Customer Group", icon: Users, permission: "contacts.customer_groups.manage" },
          { to: "/suppliers", label: "Supplier", icon: Truck, permission: "contacts.suppliers.view" },
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
        permission: "products.view",
        children: [
          { to: "/products", label: "List Products", icon: List, permission: "products.view" },
          { to: "/products/categories", label: "List Categories", icon: Tag, permission: "products.categories.manage" },
          { to: "/products/units", label: "Units", icon: Tag, permission: "products.units.manage" },
          { to: "/products/selling-price-groups", label: "Selling Price Groups", icon: Tag, permission: "products.selling_prices.manage" },
          { to: "/product-stock", label: "Product Stock", icon: Layers, permission: "inventory.view" },
        ],
      },
      {
        to: "/production",
        label: "Production",
        icon: Factory,
        permission: "production.access",
        children: [
          { to: "/production", label: "Dashboard", icon: LayoutDashboard, permission: "production.access" },
          { to: "/production/produce", label: "Produce (New Batch)", icon: Play, permission: "production.access" },
          { to: "/raw-materials", label: "Raw Materials", icon: Wheat, permission: "production.raw_materials.view" },
          { to: "/recipes", label: "Recipes & BOM", icon: ChefHat, permission: "production.recipes.view" },
          { to: "/production/batches", label: "Production Batches", icon: Factory, permission: "production.access" },
          { to: "/production/wastage", label: "Wastage Log", icon: Undo2, permission: "production.wastage.manage" },
          { to: "/production/repurpose", label: "Repurpose Workshop", icon: Undo2, permission: "production.repurpose" },
          { to: "/production/cost-report", label: "Cost Report", icon: BarChart3, permission: "production.reports.view" },
          { to: "/production/consumption-report", label: "Consumption Report", icon: Wheat, permission: "production.reports.view" },
        ],
      },
      { to: "/transfers", label: "Transfers", icon: ArrowRightLeft, permission: "inventory.transfer" },
    ],
  },
  {
    label: "Supply Chain",
    items: [
      {
        to: "/purchasing",
        label: "Purchase",
        icon: ShoppingBag,
        permission: "purchases.view",
        children: [
          { to: "/purchasing/new", label: "Add Purchase", icon: Plus, permission: "purchases.create" },
          { to: "/purchasing/list", label: "Purchase List", icon: List, permission: "purchases.view" },
          { to: "/purchasing/categories", label: "Purchase Category", icon: Tag, permission: "purchases.view" },
          { to: "/purchasing/returns", label: "Purchase Returns", icon: Undo2, permission: "purchases.return" },
          { to: "/purchasing/payments", label: "Supplier Payments", icon: Wallet, permission: "purchases.payments" },
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
        permission: "expenses.view",
        children: [
          { to: "/expenses/new", label: "Add Expense", icon: Plus, permission: "expenses.manage" },
          { to: "/expenses/list", label: "List Expenses", icon: List, permission: "expenses.view" },
          { to: "/expenses/categories", label: "Expense Categories", icon: Tag, permission: "expenses.categories.manage" },
          { to: "/expenses/report", label: "Expense Report", icon: BarChart3, permission: "reports.expenses" },
        ],
      },
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
        children: [
          { to: "/reports/stock", label: "Stock Reports", icon: Boxes, permission: "reports.stock" },
          { to: "/reports/sales", label: "Sales Reports", icon: ScanBarcode, permission: "reports.sales" },
          { to: "/reports/purchase", label: "Purchase Reports", icon: ShoppingBag, permission: "reports.purchase" },
          { to: "/reports/ledgers", label: "Payment & Return Ledger", icon: ReceiptText, permission: "reports.ledgers" },
          { to: "/reports/expenses", label: "Expense Reports", icon: Wallet, permission: "reports.expenses" },
        ],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/employees", label: "Teams & Roles", icon: UserCog, permission: "employees.view" },
      {
        to: "/settings",
        label: "Settings",
        icon: Settings,
        children: [
          { to: "/settings", label: "General", icon: Settings, permission: "settings.general" },
          { to: "/settings/showrooms", label: "Showrooms", icon: ShoppingBag, permission: "showrooms.view" },
          { to: "/settings/access", label: "Access Control", icon: ShieldCheck, permission: "settings.access" },
          { to: "/settings/landing", label: "Landing Page", icon: LayoutDashboard, permission: "settings.landing" },
        ],
      },
    ],
  },
];

// ---------- Page meta context (lets pages set the header without remounting the shell) ----------

type PageMeta = { title: string; subtitle?: string; actions?: ReactNode };
type PageMetaCtx = {
  meta: PageMeta;
  setMeta: (m: PageMeta) => void;
};
const PageMetaContext = createContext<PageMetaCtx | null>(null);

function shallowMetaEqual(a: PageMeta, b: PageMeta) {
  return a.title === b.title && a.subtitle === b.subtitle && a.actions === b.actions;
}

/**
 * Per-page wrapper. Preserves the existing `<AppShell title=... actions=...>` API,
 * but no longer renders the sidebar/header itself — those live in `AppShellFrame`
 * mounted once by the authenticated layout. This means navigation no longer
 * remounts the sidebar, permissions, company info, or user menu.
 */
export function AppShell({ children, title, subtitle, actions }: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const ctx = useContext(PageMetaContext);
  useLayoutEffect(() => {
    if (!ctx) return;
    const next = { title, subtitle, actions };
    if (!shallowMetaEqual(ctx.meta, next)) ctx.setMeta(next);
  });
  return <>{children}</>;
}

let companyLoadedOnce = false;

/**
 * Persistent chrome (sidebar + header + main slot). Mount ONCE from the
 * authenticated layout route and put `<Outlet />` inside it.
 */
export function AppShellFrame() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash ?? "" });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanySettings>(() => getCachedCompany() ?? defaultCompany);
  const { loading: permLoading, isSuperadmin, permissions } = usePermissions();

  const [meta, setMetaState] = useState<PageMeta>({ title: "" });
  const setMeta = useCallback((m: PageMeta) => setMetaState(m), []);
  const metaCtx = useMemo<PageMetaCtx>(() => ({ meta, setMeta }), [meta, setMeta]);

  const can = (key?: string) => !key || isSuperadmin || permissions.has(key);
  const visibleGroups = useMemo(() => (permLoading
    ? []
    : navGroups
        .map((g) => {
          const items = g.items
            .map((it) => {
              if (!can(it.permission)) return null;
              if (!it.children) return it;
              const kids = it.children.filter((c) => can(c.permission));
              if (kids.length === 0 && it.permission == null) return null;
              return { ...it, children: kids };
            })
            .filter(Boolean) as NavItem[];
          return { ...g, items };
        })
        .filter((g) => g.items.length > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [permLoading, isSuperadmin, permissions]);

  useEffect(() => {
    let mounted = true;
    const load = () => getCompany().then((c) => { if (mounted) setCompany(c); }).catch(() => {});
    if (!companyLoadedOnce) { companyLoadedOnce = true; load(); }
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
    <PageMetaContext.Provider value={metaCtx}>
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
            {visibleGroups.map((g) => (
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
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight truncate">{meta.title}</h1>
                {meta.subtitle && <p className="text-sm text-muted-foreground mt-1">{meta.subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ShowroomSwitcher />
              {meta.actions}
            </div>
          </div>

          <main className="flex-1 px-4 md:px-8 py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </PageMetaContext.Provider>
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

let userMenuLoadedOnce = false;
function UserMenu() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string>(() => {
    try { return localStorage.getItem("user-email-cache-v1") ?? ""; } catch { return ""; }
  });
  const [role, setRole] = useState<string>(() => {
    try { return localStorage.getItem("user-role-cache-v1") ?? ""; } catch { return ""; }
  });
  const [profile, setProfile] = useState<UserProfile | null>(() => getCachedProfile());

  useEffect(() => {
    let mounted = true;
    if (!userMenuLoadedOnce) {
      userMenuLoadedOnce = true;
      (async () => {
        const { data } = await supabase.auth.getUser();
        if (!mounted || !data.user) return;
        const em = data.user.email ?? "";
        setEmail(em);
        try { localStorage.setItem("user-email-cache-v1", em); } catch { /* ignore */ }
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
        if (mounted && roles && roles.length) {
          setRole(roles[0].role);
          try { localStorage.setItem("user-role-cache-v1", roles[0].role); } catch { /* ignore */ }
        }
      })();
      getProfile().then((p) => { if (mounted) setProfile(p); }).catch(() => {});
    }
    const handler = () => getProfile().then((p) => { if (mounted) setProfile(p); }).catch(() => {});
    window.addEventListener("user-profile-updated", handler);
    return () => { mounted = false; window.removeEventListener("user-profile-updated", handler); };
  }, []);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      localStorage.removeItem("user-profile-cache-v1");
      localStorage.removeItem("user-email-cache-v1");
      localStorage.removeItem("user-role-cache-v1");
    } catch { /* ignore */ }
    userMenuLoadedOnce = false;
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
