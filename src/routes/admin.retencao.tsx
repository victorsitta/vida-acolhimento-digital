import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eraser, History, ShieldCheck } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { DataPolicy } from "@/components/common/DataPolicy";
import { Button } from "@/components/ui/button";
import { retentionService } from "@/services";
import { RETENTION } from "@/lib/retention";
import { fmtDateTime } from "@/utils/format";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/admin/retencao")({
  head: () => ({ meta: [{ title: "Privacidade e retenção — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  const qc = useQueryClient();
  const preview = useQuery({ queryKey: ["retention"], queryFn: retentionService.preview, retry: false });
  const run = useMutation({
    mutationFn: retentionService.run,
    onSuccess: (r) => {
      toast.success(
        `Limpeza feita: ${r.chatMessages} mensagens de atendimento, ${r.groupMessages} de grupos, ${r.logs} logs e ${r.notifications} avisos apagados.`,
      );
      qc.invalidateQueries({ queryKey: ["retention"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível executar a limpeza."),
  });

  const p = preview.data;
  const total = p ? p.chatMessages + p.groupMessages + p.logs + p.notifications : 0;

  return (
    <AppShell>
      <PageHeader
        title="Privacidade e retenção"
        description="Quanto tempo cada dado é guardado. A limpeza roda sozinha todo dia; aqui você acompanha e pode rodar na hora."
        actions={
          <Button
            className="gap-2"
            variant="destructive"
            disabled={run.isPending || total === 0}
            onClick={() => {
              if (window.confirm(`Apagar definitivamente ${total} registros vencidos? Isso não pode ser desfeito.`)) run.mutate();
            }}
          >
            <Eraser className="h-4 w-4" /> {run.isPending ? "Limpando…" : "Executar limpeza agora"}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Mensagens de atendimento vencidas" icon={ShieldCheck} tone="primary" value={String(p?.chatMessages ?? 0)} hint={`Mais de ${RETENTION.chatDays} dias após encerrar`} />
        <StatCard label="Mensagens de grupos vencidas" icon={ShieldCheck} tone="info" value={String(p?.groupMessages ?? 0)} hint={`Mais de ${RETENTION.groupDays} dias`} />
        <StatCard label="Logs vencidos" icon={History} tone="accent" value={String(p?.logs ?? 0)} hint={`Mais de ${RETENTION.logDays} dias`} />
        <StatCard label="Avisos vencidos" icon={ShieldCheck} tone="success" value={String(p?.notifications ?? 0)} hint={`Mais de ${RETENTION.notificationDays} dias`} />
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        {p?.lastRun ? `Última limpeza: ${fmtDateTime(p.lastRun)}.` : "Nenhuma limpeza registrada ainda."}{" "}
        {preview.isError && "Não foi possível consultar. Rode o SQL de retenção no Supabase."}
      </p>

      <h2 className="mb-3 font-display text-base font-semibold">Política que os usuários veem</h2>
      <DataPolicy />
    </AppShell>
  );
}
