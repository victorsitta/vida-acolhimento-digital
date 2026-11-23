import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, CalendarClock, CheckCircle2, HandHeart } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appointmentService, availabilityService, type Appointment } from "@/services/features";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vol/agenda")({
  head: () => ({ meta: [{ title: "Agenda — VIDA+" }] }),
  component: Page,
});

const pad = (n: number) => String(n).padStart(2, "0");

function Slot({ a, mine, children }: { a: Appointment; mine: boolean; children: React.ReactNode }) {
  const d = new Date(a.startsAt);
  return (
    <li className={cn("card-lift flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft", mine && "border-success/40")}>
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-center leading-none text-primary">
        <div>
          <p className="font-display text-xl font-semibold">{d.getDate()}</p>
          <p className="text-[10px] font-semibold uppercase">{d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold">
          {d.toLocaleDateString("pt-BR", { weekday: "long" })}, {pad(d.getHours())}:{pad(d.getMinutes())}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {a.personName ?? "Pessoa"}
          {a.topic ? ` · ${a.topic}` : ""}
        </p>
      </div>
      {children}
    </li>
  );
}

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 08h às 22h

function AvailabilityEditor() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["availability"], queryFn: availabilityService.get, retry: false });
  const [cells, setCells] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.isSuccess) {
      setCells(new Set((q.data ?? []).map((c) => `${c.weekday}-${c.hour}`)));
      setDirty(false);
    }
  }, [q.isSuccess, q.data]);

  const toggle = (k: string) => {
    setCells((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
    setDirty(true);
  };
  const toggleDay = (wd: number) => {
    setCells((cur) => {
      const n = new Set(cur);
      const all = HOURS.every((h) => n.has(`${wd}-${h}`));
      HOURS.forEach((h) => (all ? n.delete(`${wd}-${h}`) : n.add(`${wd}-${h}`)));
      return n;
    });
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      availabilityService.save(
        Array.from(cells).map((k) => {
          const [weekday, hour] = k.split("-").map(Number);
          return { weekday, hour };
        }),
      ),
    onSuccess: () => {
      toast.success("Seus horários foram salvos. As pessoas já podem agendar com você!");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar."),
  });

  return (
    <section className="mb-8 rounded-3xl border bg-card p-5 shadow-soft sm:p-6" aria-labelledby="disp">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="disp" className="font-display text-lg font-semibold">
            Meus horários disponíveis
          </h2>
          <p className="text-sm text-muted-foreground">
            Marque quando você pode atender, toda semana. As pessoas só veem horários em que alguém está disponível.
          </p>
        </div>
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : "Salvar horários"}
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[34rem] grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-1.5 text-center text-xs">
          <span />
          {WEEK.map((d, wd) => (
            <button key={d} type="button" onClick={() => toggleDay(wd)} className="rounded-lg py-1.5 font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`Marcar ou limpar ${d}`}>
              {d}
            </button>
          ))}
          {HOURS.map((h) => (
            <div key={h} className="contents">
              <span className="self-center text-right text-muted-foreground">{String(h).padStart(2, "0")}h</span>
              {WEEK.map((_, wd) => {
                const on = cells.has(`${wd}-${h}`);
                return (
                  <button
                    key={`${wd}-${h}`}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${WEEK[wd]} ${h} horas`}
                    onClick={() => toggle(`${wd}-${h}`)}
                    className={cn("h-7 rounded-md border transition", on ? "border-primary bg-primary shadow-sm" : "bg-background/60 hover:border-primary/50 hover:bg-primary/10")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {cells.size} horário{cells.size === 1 ? "" : "s"} marcado{cells.size === 1 ? "" : "s"} por semana. Cada marca é uma hora cheia (horário de Brasília).
      </p>
    </section>
  );
}

function Page() {
  useAuthGuard();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["appointments-open"], queryFn: appointmentService.open, refetchInterval: 30_000, retry: false });
  const refresh = () => qc.invalidateQueries({ queryKey: ["appointments-open"] });

  const claim = useMutation({
    mutationFn: appointmentService.claim,
    onSuccess: () => {
      toast.success("Horário assumido. A pessoa foi avisada!");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível assumir."),
  });
  const done = useMutation({ mutationFn: appointmentService.complete, onSuccess: refresh });
  const release = useMutation({
    mutationFn: appointmentService.release,
    onSuccess: (r) => {
      toast.success(r.reassigned ? "Passamos o horário para outro voluntário." : "Sem outro voluntário livre: avisamos a pessoa para remarcar.");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível liberar."),
  });

  const list = q.data ?? [];
  const mine = list.filter((a) => a.status === "confirmado" && a.volunteerId);
  const open = list.filter((a) => a.status === "aberto");

  return (
    <AppShell>
      <PageHeader title="Agenda" description="Defina quando você atende. O sistema escolhe você entre os voluntários livres e avisa pelo sino." />

      <AvailabilityEditor />

      {q.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className={cn("grid gap-8", open.length > 0 && "lg:grid-cols-2")}>
          <section aria-labelledby="meus">
            <h2 id="meus" className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
              <CalendarCheck className="h-5 w-5 text-success" /> Meus horários
            </h2>
            {mine.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="Nenhuma conversa agendada" description="Quando alguém agendar num horário em que você está disponível, ela aparece aqui e no sino." />
            ) : (
              <ul className="stagger space-y-3">
                {mine.map((a) => (
                  <Slot key={a.id} a={a} mine>
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-1.5" disabled={done.isPending} onClick={() => done.mutate(a.id)}>
                        <CheckCircle2 className="h-4 w-4" /> Concluir
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={release.isPending} onClick={() => window.confirm("Não pode atender? O sistema passa para outro voluntário livre.") && release.mutate(a.id)}>
                        Liberar
                      </Button>
                    </div>
                  </Slot>
                ))}
              </ul>
            )}
          </section>

          {open.length > 0 && (
          <section aria-labelledby="abertos">
            <h2 id="abertos" className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
              <CalendarClock className="h-5 w-5 text-primary" /> Pedidos sem voluntário
            </h2>
            {open.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nenhum pedido agora" description="Quando alguém marcar um horário, você é avisado pelo sino." />
            ) : (
              <ul className="stagger space-y-3">
                {open.map((a) => (
                  <Slot key={a.id} a={a} mine={false}>
                    <Button size="sm" className="gap-1.5" disabled={claim.isPending} onClick={() => claim.mutate(a.id)}>
                      <HandHeart className="h-4 w-4" /> Assumir
                    </Button>
                  </Slot>
                ))}
              </ul>
            )}
          </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
