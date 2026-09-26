import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  page: number; // 0-based
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  loading?: boolean;
};

/** Prev / next pager for server-side paginated lists. */
export function Pager({ page, pageSize, total, onPage, loading }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
      <span>
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 px-2" disabled={loading || page <= 0} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-3.5" /> Prev
        </Button>
        <span>
          Page {page + 1} / {pages}
        </span>
        <Button size="sm" variant="outline" className="h-7 px-2" disabled={loading || page + 1 >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
