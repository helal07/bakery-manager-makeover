import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { LocationPicker } from "@/components/location-picker";

export const Route = createFileRoute("/_authenticated/switch-location")({
  component: SwitchLocationPage,
});

function SwitchLocationPage() {
  const navigate = useNavigate();
  return (
    <AppShell title="Switch Location" subtitle="Choose the factory or showroom you want to work in">
      <div className="py-2">
        <LocationPicker
          title="Switch location"
          subtitle="Pick where you want to work. Only locations your role grants are listed."
          onPicked={() => navigate({ to: "/dashboard" })}
        />
      </div>
    </AppShell>
  );
}
