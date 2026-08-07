import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/crm")({
  component: () => (
    <PermissionGate
      anyOf={["contacts.customers.view", "contacts.customers.manage", "contacts.customers.ledger"]}
      title="Customers"
    >
      <Outlet />
    </PermissionGate>
  ),
});
