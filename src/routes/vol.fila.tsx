import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellOff, BellRing, CheckCircle2, Clock, HeartHandshake, Timer, Users } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { PriorityBadge } from "@/components/common/PriorityBadge";
import { WaitTimer } from "@/components/common/WaitTimer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { queueService, volunteerService } from "@/services";
import { toast } from "sonner";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useVolunteerQueueRealtime } from "@/hooks/useVolunteerQueueRealtime";
import { useQueueAlerts } from "@/hooks/useQueueAlerts";
import type { QueueEntry } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vol/fila")({
  head: () => ({ meta: [{ title: "Fila completa — VIDA+" }] }),
  component: Page,
});

const initials = (n: string) =>
  n.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

function Page() {
  useAuthGuard();
  const navigate = useNavigate();

  useVolunteerQueueRealtime(true);

  const q = useQuery({ queryKey: ["queue"], queryFn: queueService.list });
  const status = useQuery({ queryKey: ["queue-status-vol"], queryFn: () => queueService.status(), refetchInterval: 10_000 });
  const { sound, setSound } = useQueueAlerts(q.data);

  const accept = useMutation({
    mutationFn: (id: string) => volunteerService.accept(id),
    onSuccess: (d) => navigate({ to: "/vol/chat/$id", params: { id: d.conversationId } }),
    onError: (err: any) => toast.error(err?.message || "Não foi possível aceitar o atendimento."),
  });

  // crise primeiro; dentro de cada nível, quem espera há mais tempo
  const rank = { crise: 0, prioritaria: 1, normal: 2 } as const;
  const list = [...(q.data ?? [])].sort(
    (a, b) => rank[a.priority] - rank[b.priority] || new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime(),
  );
  const longest = list.length ? Math.max(...list.map((e) => Date.now() - new Date(e.waitingSince).getTime())) : 0;
  const longestMin = Math.floor(longest / 60000);

  return (
    <AppShell>
      <PageHeader
        title="Fila de atendimento"
        description="Quem está esperando agora. Crise primeiro, depois quem aguarda há mais tempo."
        actions={
          <Button
            variant={sound ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setSound(!sound)}
            aria-pressed={sound}
            data-tip={sound ? "Você será avisado com som quando alguém entrar" : "Ative para ser avisado com som"}
          >
            {sound ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {sound ? "Avisos ligados" : "Avisos desligados"}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Aguardando" icon={Users} tone="primary" value={String(list.length)} />
        <StatCard
          label="Maior espera"
          icon={Timer}
          tone={longestMin >= 5 ? "accent" : "success"}
          value={`${longestMin} min`}
          hint={longestMin >= 5 ? "Atenda primeiro quem espera mais" : "Dentro do esperado"}
        />
        <StatCard label="Voluntários online" icon={HeartHandshake} tone="info" value={String(status.data?.online ?? 0)} />
      </div>

      {q.isPending && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!q.isPending && list.length === 0 && (
        <EmptyState icon={Clock} title="Ninguém aguardando agora" description="Quando alguém entrar na fila, você é avisado aqui, com som se os avisos estiverem ligados." />
      )}

      <ul className="stagger space-y-3">
        {list.map((e, i) => (
          <QueueRow key={e.id} e={e} position={i + 1} onAccept={() => accept.mutate(e.id)} loading={accept.isPending} />
        ))}
      </ul>
    </AppShell>
  );
}

function QueueRow({
  e,
  position,
  onAccept,
  loading,
}: {
  e: QueueEntry;
  position: number;
  onAccept: () => void;
  loading: boolean;
}) {
  const crisis = e.priority === "crise";
  return (
    <li
      className={cn(
        "card-lift flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft",
        crisis && "border-destructive/40 bg-destructive/5",
      )}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
        {position}
      </span>
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-2xl font-display text-sm font-semibold",
          crisis ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary",
        )}
        aria-hidden="true"
      >
        {initials(e.alias)}
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-semibold">{e.alias}</p>
        <p className="truncate text-xs text-muted-foreground">{e.topic}</p>
      </div>
      <div className="flex items-center gap-2">
        <PriorityBadge priority={e.priority} />
        <WaitTimer since={e.waitingSince} />
      </div>
      <Button className="gap-1.5" disabled={loading} onClick={onAccept}>
        <CheckCircle2 className="h-4 w-4" /> Aceitar
      </Button>
    </li>
  );
}
