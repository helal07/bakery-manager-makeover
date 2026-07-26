import { createFileRoute } from "@tanstack/react-router";
import { ProductForm } from "@/components/product-form";
import { pageTitle } from "@/lib/company-settings";

type Search = { from?: string };

export const Route = createFileRoute("/_authenticated/products/new")({
  head: () => ({ meta: [{ title: pageTitle("Add Product") }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    from: typeof s.from === "string" && s.from ? s.from : undefined,
  }),
  component: NewProductRoute,
});

function NewProductRoute() {
  const { from } = Route.useSearch();
  return <ProductForm from={from} />;
}
