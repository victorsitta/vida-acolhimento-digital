import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, CheckCircle2, Clock3, Hourglass, XCircle } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { HeroBanner } from "@/components/common/HeroBanner";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { appointmentService, type Appointment } from "@/services/features";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/agendar")({
  head: () => ({ meta: [{ title: "Agendar conversa — VIDA+" }] }),
  component: Page,
});

const STATUS: Record<Appointment["status"], { label: string; icon: typeof Clock3; cls: string }> = {
  aberto: { label: "Aguardando um voluntário", icon: Hourglass, cls: "bg-warning/25 text-foreground" },
  confirmado: { label: "Confirmada", icon: CheckCircle2, cls: "bg-success/15 text-success" },
  cancelado: { label: "Cancelada", icon: XCircle, cls: "bg-muted text-muted-foreground" },
  concluido: { label: "Concluída", icon: CheckCircle2, cls: "bg-muted text-muted-foreground" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function Page() {
  useAuthGuard();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["appointments"], queryFn: appointmentService.mine, refetchInterval: 30_000, retry: false });

  const min = useMemo(() => toLocalInput(new Date(Date.now() + 30 * 60_000)), []);
  const [when, setWhen] = useState("");
  const [topic, setTopic] = useState("");

  const create = useMutation({
    mutationFn: () => appointmentService.create(new Date(when).toISOString(), topic.trim() || undefined),
    onSuccess: () => {
      toast.success("Horário pedido! Avisaremos quando um voluntário confirmar.");
      setWhen("");
      setTopic("");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível agendar."),
  });
  const cancel = useMutation({
    mutationFn: appointmentService.cancel,
    onSuccess: () => {
      toast("Agendamento cancelado.");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  const now = Date.now();
  const upcoming = (q.data ?? []).filter((a) => ["aberto", "confirmado"].includes(a.status) && new Date(a.startsAt).getTime() > now - 3600_000);
  const past = (q.data ?? []).filter((a) => !upcoming.includes(a)).slice(-5).reverse();

  return (
    <AppShell>
      <HeroBanner
        icon={CalendarClock}
        eyebrow="No seu tempo"
        title="Agendar uma conversa"
        description="Escolha um dia e horário. Um voluntário confirma e você recebe um lembrete antes de começar."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="proximas">
          <h2 id="proximas" className="mb-3 font-display text-lg font-semibold">
            Próximas conversas
          </h2>
          {q.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nada agendado" description="Marque um horário ao lado. Você pode agendar até 3 conversas." />
          ) : (
            <ul className="stagger space-y-3">
              {upcoming.map((a) => {
                const s = STATUS[a.status];
                const d = new Date(a.startsAt);
                return (
                  <li key={a.id} className="card-lift flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft">
                    <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-center leading-none text-primary">
                      <div>
                        <p className="font-display text-xl font-semibold">{d.getDate()}</p>
                        <p className="text-[10px] font-semibold uppercase">{d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</p>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="text-sm font-semibold">
                        {d.toLocaleDateString("pt-BR", { weekday: "long" })}, às {pad(d.getHours())}:{pad(d.getMinutes())}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.volunteerName ? `com ${a.volunteerName}` : "ainda sem voluntário"}
                        {a.topic ? ` · ${a.topic}` : ""}
                      </p>
                      <span className={cn("mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", s.cls)}>
                        <s.icon className="h-3.5 w-3.5" /> {s.label}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={cancel.isPending} onClick={() => window.confirm("Cancelar este horário?") && cancel.mutate(a.id)}>
                      Cancelar
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {past.length > 0 && (
            <>
              <h3 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Anteriores</h3>
              <ul className="space-y-2">
                {past.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card/60 px-4 py-2.5 text-sm">
                    <span>{new Date(a.startsAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                    <span className="text-xs text-muted-foreground">{STATUS[a.status].label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <form
          className="h-fit space-y-4 rounded-3xl border bg-card p-5 shadow-soft sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (when) create.mutate();
          }}
        >
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <CalendarPlus className="h-5 w-5 text-primary" /> Marcar horário
          </h2>
          <div className="space-y-1.5">
            <label htmlFor="when" className="text-sm font-medium">
              Dia e horário
            </label>
            <Input id="when" type="datetime-local" min={min} value={when} onChange={(e) => setWhen(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="topic" className="text-sm font-medium">
              Quer adiantar o assunto? <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Textarea id="topic" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex.: ansiedade com o trabalho" maxLength={300} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={!when || create.isPending}>
            {create.isPending ? "Enviando…" : "Pedir este horário"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Precisa conversar agora? Use <strong>Conversar</strong> no menu. Em risco, ligue 188 ou 192.
          </p>
        </form>
      </div>
    </AppShell>
  );
}
