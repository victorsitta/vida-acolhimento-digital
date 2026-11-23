import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Crown, HeartHandshake, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { HeroBanner } from "@/components/common/HeroBanner";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { applicationService, moderatorApplicationService } from "@/services";
import { fmtDateTime } from "@/utils/format";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vol/candidatura")({
  head: () => ({ meta: [{ title: "Minha candidatura — VIDA+" }] }),
  component: Page,
});

/** Trilha: Usuário → Voluntário → Moderador, com a etapa atual destacada. */
function Journey({ stage }: { stage: 0 | 1 | 2 }) {
  const steps = [
    { icon: UserRound, label: "Usuário" },
    { icon: HeartHandshake, label: "Voluntário" },
    { icon: ShieldCheck, label: "Moderador" },
  ];
  return (
    <ol className="flex items-center" aria-label="Sua trilha na plataforma">
      {steps.map((s, i) => {
        const done = i < stage;
        const current = i === stage;
        return (
          <li key={s.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "grid h-12 w-12 place-items-center rounded-2xl border transition-all",
                  done && "border-success/40 bg-success/15 text-success",
                  current && "border-primary bg-primary text-primary-foreground shadow-glow",
                  !done && !current && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" aria-hidden="true" />}
              </span>
              <span className={cn("text-xs font-medium", current ? "text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={cn("mx-2 mb-5 h-0.5 flex-1 rounded-full", i < stage ? "bg-success/60" : "bg-border")}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Page() {
  useAuthGuard();
  const [motivation, setMotivation] = useState("");
  const [experience, setExperience] = useState("");

  const q = useQuery({ queryKey: ["my-application"], queryFn: applicationService.getMine, retry: false });
  const application = q.data;
  const moderatorApplication = useQuery({
    queryKey: ["my-moderator-application"],
    queryFn: moderatorApplicationService.getMine,
    retry: false,
  });
  const submitModerator = useMutation({
    mutationFn: () => moderatorApplicationService.submit({ motivation, experience }),
    onSuccess: () => {
      toast.success("Candidatura para moderador enviada ao administrador.");
      moderatorApplication.refetch();
    },
    onError: (error: any) => toast.error(error?.message || "Não foi possível enviar."),
  });

  const modApp = moderatorApplication.data;
  const stage: 0 | 1 | 2 = modApp?.status === "aprovado" ? 2 : 1;

  return (
    <AppShell>
      <HeroBanner
        icon={Crown}
        eyebrow="Sua trilha"
        title="Minha candidatura"
        description="Acompanhe seu caminho na plataforma e peça para crescer: voluntários podem se candidatar a moderador."
      />

      <section className="mb-6 rounded-3xl border bg-card p-6 shadow-soft sm:p-8">
        <Journey stage={stage} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border bg-card p-6 shadow-soft">
          <h2 className="font-display text-xl font-semibold">Como voluntário</h2>
          {q.isPending ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : !application ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhuma candidatura encontrada.</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <StatusBadge status={application.status} />
                {application.id !== "self" && (
                  <span className="text-sm text-muted-foreground">
                    Enviada em {fmtDateTime(application.submittedAt)}
                  </span>
                )}
              </div>
              {application.motivation && (
                <p className="mt-4 text-sm text-muted-foreground text-pretty">{application.motivation}</p>
              )}
              {application.status === "aprovado" && (
                <p className="mt-4 rounded-2xl bg-success/10 p-3 text-sm">
                  Você está apto(a) a realizar atendimentos. Mantenha sua disponibilidade atualizada no painel.
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-3xl border bg-card p-6 shadow-soft">
          <h2 className="font-display text-xl font-semibold">Quero ser moderador</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Moderadores cuidam dos grupos e das denúncias. Somente administradores aprovam.
          </p>
          {moderatorApplication.isPending ? (
            <div className="mt-5 space-y-3">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : modApp ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={modApp.status} />
                {modApp.id !== "self" && (
                  <span className="text-sm text-muted-foreground">
                    Enviada em {fmtDateTime(modApp.submittedAt)}
                  </span>
                )}
              </div>
              {modApp.motivation && (
                <p className="mt-4 text-sm">
                  <strong>Motivação:</strong> {modApp.motivation}
                </p>
              )}
              {modApp.experience && (
                <p className="mt-2 text-sm">
                  <strong>Experiência:</strong> {modApp.experience}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <Textarea
                value={motivation}
                onChange={(event) => setMotivation(event.target.value)}
                placeholder="Por que deseja atuar como moderador?"
                rows={4}
              />
              <Textarea
                value={experience}
                onChange={(event) => setExperience(event.target.value)}
                placeholder="Descreva sua experiência como voluntário."
                rows={3}
              />
              <Button
                size="lg"
                className="w-full sm:w-auto"
                disabled={motivation.trim().length < 10 || experience.trim().length < 5 || submitModerator.isPending}
                onClick={() => submitModerator.mutate()}
              >
                {submitModerator.isPending ? "Enviando..." : "Enviar candidatura"}
              </Button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
