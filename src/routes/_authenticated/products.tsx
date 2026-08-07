import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PermissionGate } from "@/components/permission-gate";

export const Route = createFileRoute("/_authenticated/products")({
  component: () => (
    <PermissionGate
      anyOf={[
        "products.view",
        "products.categories.manage",
        "products.units.manage",
        "products.selling_prices.manage",
      ]}
      title="Products"
    >
      <Outlet />
    </PermissionGate>
  ),
});
