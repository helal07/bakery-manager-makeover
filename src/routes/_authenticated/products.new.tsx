import { createFileRoute } from "@tanstack/react-router";
import { ProductForm } from "@/components/product-form";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/products/new")({
  head: () => ({ meta: [{ title: pageTitle("Add Product") }] }),
  component: () => <ProductForm />,
});
