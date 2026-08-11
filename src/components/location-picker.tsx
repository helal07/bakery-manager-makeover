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
      <div className="text-center mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1.5">{subtitle}</p>
      </div>

      {noneAvailable ? (
        <p className="text-sm text-destructive text-center">
          No location has been assigned to your account. Please ask the owner or an admin to assign you a showroom.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:gap-3 sm:grid-cols-2">
          {hasGlobalAccess && (
            <Tile
              active={currentShowroomId === null}
              icon={<Factory className="size-4 sm:size-5" />}
              name="Factory / All locations"
              meta="Production, raw materials & company-wide reports"
              onClick={() => pick(null)}
            />
          )}
          {showrooms.map((s) => (
            <Tile
              key={s.id}
              active={currentShowroomId === s.id}
              icon={<Store className="size-4 sm:size-5" />}
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
        "group w-full text-left rounded-xl border bg-card p-3 sm:p-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 transition hover:border-primary hover:shadow-md active:scale-[0.99]",
        active ? "border-primary ring-1 ring-primary/30" : "border-border",
      )}
    >
      <span className="size-9 sm:size-10 shrink-0 grid place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm sm:text-base font-medium">
          <span className="truncate">{name}</span>
          {active && <Check className="size-3.5 text-primary shrink-0" />}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{meta}</span>
        </span>
      </span>
    </button>
  );
}

/** Full-screen blocking version shown right after sign-in. */
export function LocationPickerOverlay() {
  return (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm overflow-y-auto overscroll-contain">
      <div className="min-h-full flex items-start sm:items-center justify-center p-3 sm:p-8">
        <div className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-xl p-4 sm:p-8">
          <LocationPicker />
        </div>
      </div>
    </div>
  );
}

