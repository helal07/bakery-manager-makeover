import { createFileRoute } from "@tanstack/react-router";
import { ProductForm } from "@/components/product-form";

export const Route = createFileRoute("/_authenticated/products/edit/$id")({
  head: () => ({ meta: [{ title: "Edit Product · Crumb & Co." }] }),
  component: EditProductRoute,
});

function EditProductRoute() {
  const { id } = Route.useParams();
  return <ProductForm editId={id} />;
}
