import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/production/repurpose")({
  beforeLoad: () => {
    throw redirect({ to: "/production/wastage" });
  },
});
