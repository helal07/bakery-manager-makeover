import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ArrowLeft } from "lucide-react";
import { EmployeeForm, emptyEmployee } from "@/components/employee-form";

export const Route = createFileRoute("/_authenticated/employees/new")({
  head: () => ({ meta: [{ title: "Add Employee · Muzahid Food" }] }),
  component: NewEmployeePage,
});

function NewEmployeePage() {
  return (
    <AppShell
      title="Add Employee"
      subtitle="Create a new team member profile"
      actions={
        <Link
          to="/employees"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
        >
          <ArrowLeft className="size-4" /> Back to Teams
        </Link>
      }
    >
      <EmployeeForm initial={emptyEmployee} mode="new" />
    </AppShell>
  );
}
