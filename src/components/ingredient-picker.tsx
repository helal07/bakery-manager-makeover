import { Check, ChevronsUpDown, Package, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { RawMaterial } from "@/lib/raw-material-store";
import { Link } from "@tanstack/react-router";

/**
 * Rich searchable picker for raw material ingredients.
 *
 * - Wide popover (min 380px)
 * - Rows show name + stock indicator + unit + per-unit cost
 * - Empty state with quick link to Raw Materials page
 */
export function IngredientPicker({
  materials,
  value,
  onChange,
  className,
  placeholder = "Search ingredient…",
  disabledIds,
}: {
  materials: RawMaterial[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  placeholder?: string;
  disabledIds?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const selected = materials.find((m) => m.id === value);

  const sorted = useMemo(
    () => [...materials].sort((a, b) => a.name.localeCompare(b.name)),
    [materials],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex-1 min-w-0 h-10 px-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary hover:border-primary/60 flex items-center justify-between gap-2 transition-colors",
            className,
          )}
        >
          <span className="min-w-0 flex-1 text-left">
            {selected ? (
              <span className="flex items-center gap-2 min-w-0">
                <StockDot m={selected} />
                <span className="font-medium truncate">{selected.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  ৳{selected.cost.toFixed(2)}/{selected.unit}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="size-3.5 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(420px,90vw)]" align="start">
        <Command shouldFilter>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <CommandInput
              placeholder="Type name or unit…"
              className="h-10 flex-1 outline-none border-0 focus:ring-0"
            />
          </div>
          <CommandList className="max-h-80">
            <CommandEmpty>
              <div className="px-4 py-6 text-center space-y-2">
                <Package className="size-6 text-muted-foreground mx-auto" />
                <div className="text-sm font-medium">কোনো ingredient পাওয়া যায়নি</div>
                <Link
                  to="/raw-materials"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="size-3" /> Add new ingredient
                </Link>
              </div>
            </CommandEmpty>
            <div className="py-1">
              {sorted.map((m) => {
                const isDisabled = disabledIds?.has(m.id) && m.id !== value;
                const isSelected = value === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isDisabled}
                    data-selected={isSelected}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-accent transition-colors",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      isSelected && "bg-accent/50",
                    )}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        isSelected ? "text-primary opacity-100" : "opacity-0",
                      )}
                    />
                    <StockDot m={m} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{m.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Stock: {formatQty(m.stock)} {m.unit}
                        {m.threshold > 0 && (
                          <span className="opacity-60"> · min {m.threshold}</span>
                        )}
                        {isDisabled && (
                          <span className="ml-1 text-destructive">· already added</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-medium tabular-nums">
                        ৳{m.cost.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase">
                        per {m.unit}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function StockDot({ m }: { m: RawMaterial }) {
  let color = "bg-emerald-500";
  let title = `${formatQty(m.stock)} ${m.unit} in stock`;
  if (m.stock <= 0) {
    color = "bg-red-500";
    title = "Out of stock";
  } else if (m.threshold > 0 && m.stock <= m.threshold) {
    color = "bg-amber-500";
    title = `Low: ${formatQty(m.stock)} / min ${m.threshold} ${m.unit}`;
  }
  return <span className={cn("size-2 rounded-full shrink-0", color)} title={title} />;
}

function formatQty(n: number) {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}
