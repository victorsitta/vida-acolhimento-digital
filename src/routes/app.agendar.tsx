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
import { appointmentService, slotService, type Appointment, type Slot } from "@/services/features";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/agendar")({
  head: () => ({ meta: [{ title: "Agendar conversa — VIDA+" }] }),
  component: Page,
});

const STATUS: Record<Appointment["status"], { label: string; icon: typeof Clock3; cls: string }> = {
  aberto: { label: "Aguardando um voluntário", icon: Hourglass, cls: "bg-warning/25 text-foreground" },
  confirmado: { label: "Confirmada · voluntário escolhido", icon: CheckCircle2, cls: "bg-success/15 text-success" },
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
  const [picked, setPicked] = useState<string | null>(null);
  const [dayKey, setDayKey] = useState<string | null>(null);

  const slots = useQuery({ queryKey: ["slots"], queryFn: slotService.list, refetchInterval: 60_000, retry: false });
  // agrupa os horários livres por dia (data local)
  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const sl of slots.data ?? []) {
      const k = toLocalInput(new Date(sl.startsAt)).slice(0, 10);
      map.set(k, [...(map.get(k) ?? []), sl]);
    }
    return Array.from(map, ([key, list]) => ({ key, slots: list }));
  }, [slots.data]);

  const create = useMutation({
    mutationFn: (startsAt: string) => appointmentService.create(startsAt, topic.trim() || undefined),
    onSuccess: () => {
      toast.success("Horário reservado! Avisaremos quando um voluntário confirmar.");
      setWhen("");
      setTopic("");
      setPicked(null);
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["slots"] });
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
        description="Escolha um horário livre. O sistema escolhe um voluntário disponível e avisa vocês dois. Você recebe um lembrete antes de começar."
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

        <section className="h-fit space-y-4 rounded-3xl border bg-card p-5 shadow-soft sm:p-6" aria-labelledby="escolher">
          <h2 id="escolher" className="flex items-center gap-2 font-display text-lg font-semibold">
            <CalendarPlus className="h-5 w-5 text-primary" /> Escolha um horário
          </h2>

          {slots.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : days.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-5 text-center">
              <p className="text-sm font-medium">Ainda não há horários disponíveis</p>
              <p className="mt-1 text-xs text-muted-foreground">Os voluntários definem quando podem atender. Volte mais tarde ou use Conversar agora.</p>
            </div>
          ) : (
            <>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Dia">
                {days.map((d) => {
                  const dt = new Date(d.key + "T12:00:00");
                  const active = d.key === (dayKey ?? days[0].key);
                  return (
                    <button
                      key={d.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setDayKey(d.key);
                        setPicked(null);
                      }}
                      className={cn(
                        "shrink-0 rounded-2xl border px-3.5 py-2 text-center transition",
                        active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background/70 hover:border-primary/50",
                      )}
                    >
                      <span className="block text-[11px] font-medium uppercase opacity-80">{dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                      <span className="block font-display text-lg font-semibold leading-tight">{dt.getDate()}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Horários livres">
                {(days.find((d) => d.key === (dayKey ?? days[0].key)) ?? days[0]).slots.map((sl) => {
                  const d = new Date(sl.startsAt);
                  const active = picked === sl.startsAt;
                  return (
                    <button
                      key={sl.startsAt}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPicked(sl.startsAt)}
                      className={cn(
                        "rounded-xl border py-2.5 text-sm font-medium tabular-nums transition",
                        active ? "border-primary bg-primary/15 ring-2 ring-primary/40" : "bg-background/70 hover:border-primary/50 hover:bg-primary/5",
                      )}
                    >
                      {pad(d.getHours())}:{pad(d.getMinutes())}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {picked && (
            <div className="pop-in space-y-3 rounded-2xl bg-primary/5 p-3">
              <p className="text-sm">
                <strong>{new Date(picked).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</strong> às{" "}
                <strong>{pad(new Date(picked).getHours())}:{pad(new Date(picked).getMinutes())}</strong>
              </p>
              <Textarea rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Quer adiantar o assunto? (opcional)" maxLength={300} />
              <Button size="lg" className="w-full" disabled={create.isPending} onClick={() => create.mutate(picked)}>
                {create.isPending ? "Agendando…" : "Confirmar horário"}
              </Button>
            </div>
          )}


          <p className="text-xs text-muted-foreground">
            O sistema escolhe um voluntário disponível nesse horário e avisa por aqui. Precisa conversar agora? Use <strong>Conversar</strong>. Em risco, ligue 188 ou 192.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
