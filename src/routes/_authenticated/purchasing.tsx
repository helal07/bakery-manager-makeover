import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/purchasing")({
  component: () => (
    <PermissionGate
      anyOf={["purchases.view", "purchases.create", "purchases.return", "purchases.payments"]}
      title="Purchase"
    >
      <Outlet />
    </PermissionGate>
  ),
});
