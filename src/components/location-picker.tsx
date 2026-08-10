import { Factory, Store, MapPin, Loader2, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useShowroomScope } from "@/hooks/use-showroom-scope";
import { cn } from "@/lib/utils";

/**
 * Location chooser: lets the user pick the factory (global users only) or one
 * of the showrooms their roles grant. Used both as the blocking overlay right
 * after sign-in and as the /switch-location page.
 */
export function LocationPicker({
  title = "Select your location",
  subtitle = "Everything you do — sales, stock, reports — stays inside the location you pick.",
  onPicked,
}: {
  title?: string;
  subtitle?: string;
  onPicked?: () => void;
}) {
  const { loading, showrooms, hasGlobalAccess, currentShowroomId, setCurrentShowroomId } = useShowroomScope();
  const queryClient = useQueryClient();

  const pick = (id: string | null) => {
    setCurrentShowroomId(id);
    void queryClient.cancelQueries();
    queryClient.clear();
    onPicked?.();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading locations…
      </div>
    );
  }

  const noneAvailable = !hasGlobalAccess && showrooms.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="text-center mb-6">
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>
      </div>

      {noneAvailable ? (
        <p className="text-sm text-destructive text-center">
          No location has been assigned to your account. Please ask the owner or an admin to assign you a showroom.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {hasGlobalAccess && (
            <Tile
              active={currentShowroomId === null}
              icon={<Factory className="size-5" />}
              name="Factory / All locations"
              meta="Production, raw materials & company-wide reports"
              onClick={() => pick(null)}
            />
          )}
          {showrooms.map((s) => (
            <Tile
              key={s.id}
              active={currentShowroomId === s.id}
              icon={<Store className="size-5" />}
              name={s.name}
              meta={[s.code, s.city].filter(Boolean).join(" · ") || "Showroom"}
              onClick={() => pick(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({
  active, icon, name, meta, onClick,
}: {
  active: boolean; icon: React.ReactNode; name: string; meta: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group text-left rounded-xl border bg-card p-4 flex items-start gap-3 transition hover:border-primary hover:shadow-md",
        active ? "border-primary ring-1 ring-primary/30" : "border-border",
      )}
    >
      <span className="size-10 shrink-0 grid place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-medium truncate">
          {name}
          {active && <Check className="size-3.5 text-primary shrink-0" />}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground truncate">
          <MapPin className="size-3 shrink-0" /> {meta}
        </span>
      </span>
    </button>
  );
}

/** Full-screen blocking version shown right after sign-in. */
export function LocationPickerOverlay() {
  return (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-8">
        <div className="w-full rounded-2xl border border-border bg-card shadow-xl p-5 sm:p-8">
          <LocationPicker />
        </div>
      </div>
    </div>
  );
}
