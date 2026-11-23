import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { communityService, reportService } from "@/services";
import { fmtDateTime } from "@/utils/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { ReportStatus } from "@/types";
import { BellRing, Eye, Trash2, ShieldAlert, UserCheck, UserX, MessageSquareOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/mod/$id")({
  head: () => ({ meta: [{ title: "Detalhes da denúncia — VIDA+" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [identityReason, setIdentityReason] = useState("");
  const [revealedIdentity, setRevealedIdentity] = useState<{
    realName: string;
    email: string;
  } | null>(null);

  useAuthGuard();

  const q = useQuery({
    queryKey: ["report", id],
    queryFn: () => reportService.get(id),
    // refetch ao focar janela para pegar status mais recente
    refetchOnWindowFocus: true,
  });
  const qc = useQueryClient();

  // Medidas de moderação (advertir, suspender, remover mensagem...) e exclusão da denúncia
  type Measure = "advertir" | "suspender" | "reativar" | "remover_mensagem";
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [measureReason, setMeasureReason] = useState("");
  const applyMeasure = useMutation({
    mutationFn: () => reportService.applyAction(id, measure!, measureReason.trim() || undefined),
    onSuccess: () => {
      toast.success("Medida aplicada e registrada na auditoria.");
      setMeasure(null);
      setMeasureReason("");
      qc.invalidateQueries({ queryKey: ["report", id] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível aplicar a medida."),
  });
  const removeReport = useMutation({
    mutationFn: () => reportService.remove(id),
    onSuccess: () => {
      toast.success("Denúncia excluída.");
      qc.invalidateQueries({ queryKey: ["reports"] });
      navigate({ to: "/mod" });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível excluir."),
  });
  const MEASURES: Record<Measure, { label: string; help: string; destructive?: boolean }> = {
    advertir: { label: "Advertir a pessoa", help: "Envia um aviso da moderação para a pessoa denunciada." },
    suspender: { label: "Suspender a conta", help: "Bloqueia o acesso da pessoa. Ela é avisada.", destructive: true },
    reativar: { label: "Reativar a conta", help: "Devolve o acesso a uma conta suspensa." },
    remover_mensagem: { label: "Remover a mensagem", help: "Apaga a mensagem denunciada do grupo.", destructive: true },
  };
  const m = useMutation({
    mutationFn: (s: ReportStatus) => reportService.setStatus(id, s, note),
    onSuccess: () => {
      toast.success("Decisão registrada.");
      // invalida lista e detalhe para refletir novo status
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["report", id] });
      navigate({ to: "/mod" });
    },
    onError: () => toast.error("Não foi possível registrar a decisão. Tente novamente."),
  });

  // revealIdentity usa o reportedAlias (target_id) do relatório como messageId
  const reveal = useMutation({
    mutationFn: () => {
      const messageId = q.data?.reportedAlias ?? id;
      return communityService.revealIdentity(messageId, identityReason);
    },
    onSuccess: (identity) => {
      setRevealedIdentity(identity);
      toast.warning("Identidade consultada. Este acesso foi registrado.");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  // Exibe o painel de revelar identidade apenas para denúncias do tipo mensagem
  // (quando o target é um alias de comunidade, não um UUID de usuário)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    q.data?.reportedAlias ?? "",
  );
  const canReveal = !!q.data && !isUuid;

  if (q.isPending)
    return (
      <AppShell>
        <p>Carregando…</p>
      </AppShell>
    );
  if (!q.data)
    return (
      <AppShell>
        <p>Não encontrada.</p>
      </AppShell>
    );
  const r = q.data;

  return (
    <AppShell>
      <PageHeader
        title={`Denúncia: ${r.reason}`}
        description={`Contra ${r.reportedAlias}`}
        actions={<StatusBadge status={r.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Detalhes</h2>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">{r.details}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Reportado por</dt>
                <dd>{r.reporterAlias}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Prioridade</dt>
                <dd className="capitalize">{r.priority}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Aberta em</dt>
                <dd>{fmtDateTime(r.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Registro de decisão</h2>
            <Textarea
              className="mt-3"
              rows={5}
              placeholder="Descreva sua avaliação e ação tomada"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </section>

          {canReveal && (
            <section className="rounded-2xl border border-amber-300/60 bg-amber-50/60 p-5 dark:bg-amber-950/20">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="w-full">
                  <h2 className="text-sm font-semibold">Identidade protegida do grupo</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use somente para investigar esta denúncia. A consulta registra moderador,
                    horário e justificativa na auditoria.
                  </p>
                  {revealedIdentity ? (
                    <div className="mt-3 rounded-xl border bg-background p-3 text-sm">
                      <p>
                        <strong>Nome:</strong> {revealedIdentity.realName}
                      </p>
                      <p className="mt-1">
                        <strong>E-mail:</strong> {revealedIdentity.email}
                      </p>
                    </div>
                  ) : (
                    <>
                      <Textarea
                        className="mt-3 bg-background"
                        rows={3}
                        placeholder="Explique por que a identidade precisa ser consultada"
                        value={identityReason}
                        onChange={(event) => setIdentityReason(event.target.value)}
                      />
                      <Button
                        className="mt-3 gap-2"
                        variant="outline"
                        disabled={identityReason.trim().length < 10 || reveal.isPending}
                        onClick={() => reveal.mutate()}
                      >
                        <Eye className="h-4 w-4" />
                        Consultar identidade
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Medidas de moderação</h2>
            <p className="mt-1 text-xs text-muted-foreground">Cada medida fica registrada nos logs.</p>
            <div className="mt-3 grid gap-2">
              <Button variant="outline" className="justify-start gap-2" onClick={() => setMeasure("advertir")}>
                <BellRing className="h-4 w-4" /> Advertir a pessoa
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => setMeasure("suspender")}>
                <UserX className="h-4 w-4" /> Suspender a conta
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => setMeasure("reativar")}>
                <UserCheck className="h-4 w-4" /> Reativar a conta
              </Button>
              {r.targetType === "mensagem" && (
                <Button variant="outline" className="justify-start gap-2" onClick={() => setMeasure("remover_mensagem")}>
                  <MessageSquareOff className="h-4 w-4" /> Remover a mensagem
                </Button>
              )}
              <Button
                variant="ghost"
                className="justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={removeReport.isPending}
                onClick={() => {
                  if (window.confirm("Excluir esta denúncia definitivamente? Prefira arquivar se quiser manter o histórico.")) removeReport.mutate();
                }}
              >
                <Trash2 className="h-4 w-4" /> Excluir denúncia
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Ações</h2>
            <div className="mt-3 grid gap-2">
              <Confirm label="Marcar em análise" onConfirm={() => m.mutate("em_analise")} />
              <Confirm label="Resolver" variant="default" onConfirm={() => m.mutate("resolvido")} />
              <Confirm label="Arquivar" variant="outline" onConfirm={() => m.mutate("arquivado")} />
            </div>
          </section>
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Histórico</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {r.history.map((h, i) => (
                <li key={i} className="grid grid-cols-[8px_1fr] items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  <div>
                    <p>{h.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateTime(h.at)} · {h.by}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
      <Dialog open={!!measure} onOpenChange={(o) => !o && setMeasure(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{measure ? MEASURES[measure].label : ""}</DialogTitle>
            <DialogDescription>{measure ? MEASURES[measure].help : ""}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            value={measureReason}
            onChange={(e) => setMeasureReason(e.target.value)}
            placeholder="Motivo (quem denunciou e a auditoria veem este texto)"
            maxLength={500}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setMeasure(null)}>
              Cancelar
            </Button>
            <Button
              variant={measure && MEASURES[measure].destructive ? "destructive" : "default"}
              disabled={applyMeasure.isPending}
              onClick={() => applyMeasure.mutate()}
            >
              {applyMeasure.isPending ? "Aplicando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Confirm({
  label,
  onConfirm,
  variant,
}: {
  label: string;
  onConfirm: () => void;
  variant?: "default" | "outline" | "destructive";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant ?? "secondary"} className="w-full justify-start">
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar ação?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação ficará registrada no histórico do caso.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
