import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { pageTitle } from "@/lib/company-settings";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: pageTitle("Expenses") }] }),
  beforeLoad: ({ location }) => {
    if (location.pathname === "/expenses" || location.pathname === "/expenses/") {
      throw redirect({ to: "/expenses/list" });
    }
  },
  component: () => (
    <PermissionGate
      anyOf={["expenses.view", "expenses.manage", "expenses.categories.manage", "reports.expenses"]}
      title="Expenses"
    >
      <Outlet />
    </PermissionGate>
  ),
});
