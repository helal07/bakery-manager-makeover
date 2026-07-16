import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/production")({
  component: () => (
    <PermissionGate anyOf={["production.access"]} title="Production">
      <Outlet />
    </PermissionGate>
  ),
});

