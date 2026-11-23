import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, CalendarClock, CheckCircle2, HandHeart } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { appointmentService, type Appointment } from "@/services/features";
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
  const cancel = useMutation({ mutationFn: appointmentService.cancel, onSuccess: refresh });

  const list = q.data ?? [];
  const mine = list.filter((a) => a.status === "confirmado" && a.volunteerId);
  const open = list.filter((a) => a.status === "aberto");

  return (
    <AppShell>
      <PageHeader title="Agenda" description="Assuma horários pedidos por pessoas e acompanhe os seus compromissos." />

      {q.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="meus">
            <h2 id="meus" className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
              <CalendarCheck className="h-5 w-5 text-success" /> Meus horários
            </h2>
            {mine.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="Nenhum horário assumido" description="Assuma um horário ao lado para ele aparecer aqui." />
            ) : (
              <ul className="stagger space-y-3">
                {mine.map((a) => (
                  <Slot key={a.id} a={a} mine>
                    <div className="flex gap-2">
                      <Button size="sm" className="gap-1.5" disabled={done.isPending} onClick={() => done.mutate(a.id)}>
                        <CheckCircle2 className="h-4 w-4" /> Concluir
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={cancel.isPending} onClick={() => window.confirm("Liberar este horário?") && cancel.mutate(a.id)}>
                        Liberar
                      </Button>
                    </div>
                  </Slot>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="abertos">
            <h2 id="abertos" className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
              <CalendarClock className="h-5 w-5 text-primary" /> Pedidos em aberto
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
        </div>
      )}
    </AppShell>
  );
}
