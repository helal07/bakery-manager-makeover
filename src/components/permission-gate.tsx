import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { AppShell, Card } from "@/components/app-shell";
import { usePermissions } from "@/hooks/use-permissions";

type Props = {
  /** User needs ANY of these permission keys. Superadmin always passes. */
  anyOf: string[];
  /** Optional title/subtitle for the AppShell wrapper on loading/deny. */
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

/**
 * Wraps a page and enforces RBAC based on the permission catalog. Reads
 * effective permissions from `usePermissions()` — no hard-coded roles.
 */
export function PermissionGate({ anyOf, title = "Access", subtitle, children }: Props) {
  const { loading, isSuperadmin, permissions, scopedPermissions } = usePermissions();

  if (loading) {
    return (
      <AppShell title={title} subtitle={subtitle}>
        <Card>
          <div className="py-10 text-center text-sm text-muted-foreground">Checking permissions…</div>
        </Card>
      </AppShell>
    );
  }

  const hasAny = (k: string) => {
    if (permissions.has(k)) return true;
    for (const s of scopedPermissions.values()) if (s.has(k)) return true;
    return false;
  };
  const allowed = isSuperadmin || anyOf.some(hasAny);
  if (allowed) return <>{children}</>;


  return (
    <AppShell title="Not authorized" subtitle="You don't have permission to view this page">
      <Card>
        <div className="py-14 flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="size-8 text-muted-foreground" />
          <div className="text-base font-medium">Access denied</div>
          <div className="text-sm text-muted-foreground max-w-md">
            This section is restricted. Ask your Superadmin to grant a role that
            includes one of these permissions:{" "}
            <span className="font-mono text-xs">{anyOf.join(", ")}</span>
          </div>
          <Link
            to="/dashboard"
            className="mt-2 inline-flex items-center px-3 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
          >
            Back to dashboard
          </Link>
        </div>
      </Card>
    </AppShell>
  );
}
