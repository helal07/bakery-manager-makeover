import { createFileRoute } from "@tanstack/react-router";
import { ProductForm } from "@/components/product-form";
import { pageTitle } from "@/lib/company-settings";

export const Route = createFileRoute("/_authenticated/products/edit/$id")({
  head: () => ({ meta: [{ title: pageTitle("Edit Product") }] }),
  component: EditProductRoute,
});

function EditProductRoute() {
  const { id } = Route.useParams();
  return <ProductForm editId={id} />;
}
