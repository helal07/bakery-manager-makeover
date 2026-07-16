import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/app-shell";
import { FileDown, RotateCcw } from "lucide-react";

export type ReportFilter = {
  from: string;
  to: string;
  category: string;
};

export function ReportFilters({
  filter,
  onChange,
  onReset,
  onExport,
  categoryOptions,
  categoryLabel = "Category",
  extra,
}: {
  filter: ReportFilter;
  onChange: (f: ReportFilter) => void;
  onReset: () => void;
  onExport?: () => void;
  categoryOptions: string[];
  categoryLabel?: string;
  extra?: React.ReactNode;
}) {
  return (
    <Card className="p-4 mb-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rf-from">From</Label>
          <Input id="rf-from" type="date" value={filter.from} onChange={(e) => onChange({ ...filter, from: e.target.value })} className="w-44" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rf-to">To</Label>
          <Input id="rf-to" type="date" value={filter.to} onChange={(e) => onChange({ ...filter, to: e.target.value })} className="w-44" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rf-cat">{categoryLabel}</Label>
          <select
            id="rf-cat"
            value={filter.category}
            onChange={(e) => onChange({ ...filter, category: e.target.value })}
            className="h-9 px-2.5 rounded-md border border-input bg-background text-sm outline-none focus:border-primary min-w-40"
          >
            <option value="All">All</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {extra}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="size-4" /> Reset
          </Button>
          {onExport && (
            <Button type="button" size="sm" onClick={onExport}>
              <FileDown className="size-4" /> Export CSV
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function exportCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}