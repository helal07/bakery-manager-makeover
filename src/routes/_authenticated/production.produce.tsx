import { createFileRoute, redirect } from "@tanstack/react-router";

type Search = { product?: string };

export const Route = createFileRoute("/_authenticated/production/produce")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    product: typeof s.product === "string" ? s.product : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/recipes",
      search: search.product ? { product: search.product } : {},
    });
  },
});
