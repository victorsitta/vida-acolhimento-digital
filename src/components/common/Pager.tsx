import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PAGE_SIZES = [5, 10, 20, 30] as const;

const snap = (n: number) => PAGE_SIZES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));

/** Paginação no cliente: devolve só os itens da página atual (5, 10, 20 ou 30 por página). */
export function usePagination<T>(items: readonly T[], defaultSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState<number>(() => snap(defaultSize));
  const setPageSize = (n: number) => {
    setSize(n);
    setPage(1);
  };
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // se a lista encolher (filtro, exclusão), volta para uma página válida
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, setPage, pageItems, total, totalPages, pageSize, setPageSize };
}

function pageWindow(page: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < totalPages - 1) out.push("…");
  out.push(totalPages);
  return out;
}

export function Pager({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  setPageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  setPageSize?: (size: number) => void;
}) {
  if (total <= PAGE_SIZES[0]) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Paginação"
      className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <p className="text-xs text-muted-foreground">
          Mostrando <strong className="text-foreground">{from}–{to}</strong> de{" "}
          <strong className="text-foreground">{total}</strong>
        </p>
        {setPageSize && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Por página
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label="Itens por página"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "ghost"}
              size="icon"
              className="h-9 w-9 text-sm"
              onClick={() => onPageChange(p)}
              aria-label={`Página ${p}`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
