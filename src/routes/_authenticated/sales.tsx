import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/sales")({
  component: () => (
    <PermissionGate
      anyOf={["sales.view", "sales.create", "sales.return", "sales.payments"]}
      title="Sales"
    >
      <Outlet />
    </PermissionGate>
  ),
});
