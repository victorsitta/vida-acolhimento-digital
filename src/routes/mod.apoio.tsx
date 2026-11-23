import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, LifeBuoy, Siren } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Pager, usePagination } from "@/components/common/Pager";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supervisorService } from "@/services/features";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { fmtRelative } from "@/utils/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mod/apoio")({
  head: () => ({ meta: [{ title: "Pedidos de apoio — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["supervisor-requests"], queryFn: supervisorService.list, refetchInterval: 15_000, retry: false });
  const resolve = useMutation({
    mutationFn: supervisorService.resolve,
    onSuccess: () => {
      toast.success("Pedido marcado como atendido.");
      qc.invalidateQueries({ queryKey: ["supervisor-requests"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível atualizar."),
  });
  // urgentes e abertos primeiro
  const list = [...(q.data ?? [])].sort(
    (a, b) => Number(a.status !== "aberto") - Number(b.status !== "aberto") || Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt),
  );
  const pg = usePagination(list, 10);
  const open = list.filter((r) => r.status === "aberto").length;

  return (
    <AppShell>
      <PageHeader
        title="Pedidos de apoio"
        description={open ? `${open} voluntário${open > 1 ? "s" : ""} aguardando orientação.` : "Voluntários pedem ajuda aqui quando um atendimento é difícil."}
      />
      {q.isPending ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="Nenhum pedido de apoio" description="Quando um voluntário pedir ajuda durante um atendimento, o pedido aparece aqui e no sino." />
      ) : (
        <ul className="stagger space-y-3">
          {pg.pageItems.map((r) => (
            <li key={r.id} className={cn("card-lift flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft", r.urgent && r.status === "aberto" && "border-destructive/40 bg-destructive/5")}>
              <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", r.urgent ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary")}>
                {r.urgent ? <Siren className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-semibold">
                  {r.volunteerName} {r.urgent && <span className="ml-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">Urgente</span>}
                </p>
                <p className="text-sm text-muted-foreground">{r.note ?? "Sem observação."}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{fmtRelative(r.createdAt)}</p>
              </div>
              {r.status === "aberto" ? (
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href="/mod/historico">Ver conversas</a>
                  </Button>
                  <Button size="sm" className="gap-1.5" disabled={resolve.isPending} onClick={() => resolve.mutate(r.id)}>
                    <CheckCircle2 className="h-4 w-4" /> Atendido
                  </Button>
                </div>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" /> Atendido
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager {...pg} onPageChange={pg.setPage} />
    </AppShell>
  );
}
