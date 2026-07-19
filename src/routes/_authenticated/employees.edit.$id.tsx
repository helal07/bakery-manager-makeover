import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmployeeForm, emptyEmployee, type EmployeeDraft } from "@/components/employee-form";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/employees/edit/$id")({
  head: () => ({ meta: [{ title: "Edit Employee · Muzahid Food" }] }),
  component: EditEmployeePage,
});

function EditEmployeePage() {
  const { id } = Route.useParams();
  const [draft, setDraft] = useState<EmployeeDraft | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("employees")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) toast.error(error.message);
      if (data) {
        setDraft({
          ...emptyEmployee,
          id: data.id,
          name: data.name ?? "",
          role: data.role ?? "",
          role_id: data.role_id ?? null,
          designation: data.designation ?? "",
          showroom_id: data.showroom_id ?? null,
          email: data.email ?? "",
          phone: data.phone ?? "",
          address: data.address ?? "",
          national_id: data.national_id ?? "",
          joining_date: data.joining_date ?? "",
          date_of_birth: data.date_of_birth ?? "",
          gender: data.gender ?? "",
          emergency_contact: data.emergency_contact ?? "",
          emergency_phone: data.emergency_phone ?? "",
          notes: data.notes ?? "",
          avatar_url: data.avatar_url ?? "",
          salary: Number(data.salary ?? 0),
          attendance: Number(data.attendance ?? 0),
          is_active: !!data.is_active,
        });
      }
      setLoading(false);
    })();
  }, [id]);

  return (
    <AppShell
      title="Edit Employee"
      subtitle={draft?.name || ""}
      actions={
        <Link
          to="/employees"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted"
        >
          <ArrowLeft className="size-4" /> Back to Teams
        </Link>
      }
    >
      {loading || !draft ? (
        <Card>
          <div className="py-10 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "Employee not found"}
          </div>
        </Card>
      ) : (
        <EmployeeForm initial={draft} mode="edit" />
      )}
    </AppShell>
  );
}
