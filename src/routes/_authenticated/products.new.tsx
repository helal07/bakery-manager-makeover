import { createFileRoute } from "@tanstack/react-router";
import { ProductForm } from "@/components/product-form";

export const Route = createFileRoute("/_authenticated/products/new")({
  head: () => ({ meta: [{ title: "Add Product · Crumb & Co." }] }),
  component: () => <ProductForm />,
});
