import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Expenses · Crumb & Co." }] }),
  beforeLoad: ({ location }) => {
    if (location.pathname === "/expenses" || location.pathname === "/expenses/") {
      throw redirect({ to: "/expenses/list" });
    }
  },
  component: () => <Outlet />,
});