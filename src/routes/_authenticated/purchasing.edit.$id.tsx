import { createFileRoute } from "@tanstack/react-router";
import { pageTitle } from "@/lib/company-settings";
import { PurchaseFormPage } from "./purchasing.new";

export const Route = createFileRoute("/_authenticated/purchasing/edit/$id")({
  head: () => ({ meta: [{ title: pageTitle("Edit Purchase") }] }),
  component: EditPurchase,
});

function EditPurchase() {
  const { id } = Route.useParams();
  return <PurchaseFormPage editId={id} />;
}
