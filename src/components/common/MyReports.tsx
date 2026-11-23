import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, Clock3, Plus, ShieldAlert, Star } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Pager, usePagination } from "@/components/common/Pager";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { reportService } from "@/services";
import { fmtDateTime, fmtRelative } from "@/utils/format";
import { cn } from "@/lib/utils";
import type { Report } from "@/types";

const STEPS = ["Recebida", "Em análise", "Concluída"];
const stepOf = (s: Report["status"]) => (s === "pendente" ? 0 : s === "em_analise" ? 1 : 2);

const OUTCOME: Record<string, string> = {
  pendente: "Aguardando a moderação pegar o caso.",
  em_analise: "A moderação está analisando.",
  resolvido: "Caso resolvido pela moderação.",
  arquivado: "Caso arquivado pela moderação.",
};

function Progress({ status }: { status: Report["status"] }) {
  const at = stepOf(status);
  return (
    <ol className="flex items-center" aria-label="Andamento da denúncia">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center last:flex-none">
          <span className="flex items-center gap-1.5">
            {i < at || (i === at && at === 2) ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : i === at ? (
              <Clock3 className="h-4 w-4 text-primary" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/40" />
            )}
            <span className={cn("text-xs", i <= at ? "font-medium text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </span>
          {i < STEPS.length - 1 && (
            <span className={cn("mx-2 h-0.5 flex-1 rounded-full", i < at ? "bg-success/60" : "bg-border")} aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
  );
}

function RateModeration({ report }: { report: Report }) {
  const qc = useQueryClient();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const m = useMutation({
    mutationFn: () => reportService.rate(report.id, stars, comment.trim() || undefined),
    onSuccess: () => {
      toast.success("Obrigado! Sua avaliação foi enviada.");
      qc.invalidateQueries({ queryKey: ["my-reports"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível enviar a avaliação."),
  });

  if (report.rating) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        Sua avaliação da moderação:
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={cn("h-3.5 w-3.5", n <= report.rating! ? "fill-primary text-primary" : "text-muted-foreground/40")} />
        ))}
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-xl border bg-muted/40 p-3">
      <p className="text-xs font-medium">Como a moderação cuidou do seu caso?</p>
      <div className="mt-1 flex gap-0.5" role="group" aria-label="Nota de 1 a 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setStars(n)} aria-label={`${n} estrelas`} className="p-0.5 transition hover:scale-125">
            <Star className={cn("h-6 w-6", n <= stars ? "fill-primary text-primary" : "text-muted-foreground/40")} />
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentário (opcional)" className="mt-2" maxLength={500} />
          <Button size="sm" className="mt-2" disabled={m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Enviando…" : "Enviar avaliação"}
          </Button>
        </>
      )}
    </div>
  );
}

/** "Minhas denúncias": andamento, resposta da moderação e avaliação do atendimento. */
export function MyReports({ newReportTo = "/app/denuncia" }: { newReportTo?: string }) {
  const [justSent, setJustSent] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("vida:just-reported") === "1") {
      sessionStorage.removeItem("vida:just-reported");
      setJustSent(true);
    }
  }, []);

  const q = useQuery({ queryKey: ["my-reports"], queryFn: reportService.listMine, staleTime: 15_000, refetchInterval: 30_000 });
  const list = q.data ?? [];
  const pg = usePagination(list, 5);

  return (
    <>
      <PageHeader
        title="Minhas denúncias"
        description="Acompanhe o andamento, veja a resposta da moderação e avalie o atendimento."
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link to={newReportTo}>
              <Plus className="h-4 w-4" /> Nova denúncia
            </Link>
          </Button>
        }
      />

      {justSent && (
        <div className="mb-5 flex gap-3 rounded-2xl border border-success/30 bg-success/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-medium">Denúncia registrada</p>
            <p className="mt-0.5 text-xs text-muted-foreground">A moderação vai analisar. O andamento aparece abaixo.</p>
          </div>
        </div>
      )}

      {q.isPending && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {!q.isPending && list.length === 0 && (
        <EmptyState icon={ShieldAlert} illustration="calm" title="Nenhuma denúncia enviada" description="Quando você enviar uma denúncia, ela aparece aqui com o andamento." />
      )}

      <ul className="stagger space-y-3">
        {pg.pageItems.map((r) => (
          <li key={r.id} className="rounded-2xl border bg-card p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{r.reason}</p>
                <p className="text-xs text-muted-foreground">
                  contra {r.reportedAlias} · enviada {fmtRelative(r.createdAt)}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>

            {r.details && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.details}</p>}

            <div className="mt-4">
              <Progress status={r.status} />
              <p className="mt-2 text-xs text-muted-foreground">
                {OUTCOME[r.status] ?? r.status}
                {r.handlerName ? ` Responsável: ${r.handlerName}.` : ""}
                {r.resolvedAt ? ` Concluída em ${fmtDateTime(r.resolvedAt)}.` : ""}
              </p>
            </div>

            {r.decision && (
              <div className="mt-3 rounded-xl bg-primary/5 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resposta da moderação</p>
                <p className="mt-1 whitespace-pre-wrap">{r.decision}</p>
              </div>
            )}

            {(r.status === "resolvido" || r.status === "arquivado") && <RateModeration report={r} />}
          </li>
        ))}
      </ul>
      <Pager {...pg} onPageChange={pg.setPage} />

      <div className="mt-6 flex items-start gap-3 rounded-xl bg-muted/50 p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Sua identidade é protegida: a moderação analisa cada caso sem revelar quem denunciou ao denunciado.
        </p>
      </div>
    </>
  );
}
