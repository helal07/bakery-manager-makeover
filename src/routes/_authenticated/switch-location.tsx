import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LocationPicker } from "@/components/location-picker";
import { usePageMeta } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/switch-location")({
  component: SwitchLocationPage,
});

function SwitchLocationPage() {
  const navigate = useNavigate();
  const { setMeta } = usePageMeta();
  useEffect(() => {
    setMeta({ title: "Switch Location", subtitle: "Choose the factory or showroom you want to work in" });
  }, [setMeta]);

  return (
    <div className="py-4">
      <LocationPicker
        title="Switch location"
        subtitle="Pick where you want to work. Only locations your role grants are listed."
        onPicked={() => navigate({ to: "/dashboard" })}
      />
    </div>
  );
}
