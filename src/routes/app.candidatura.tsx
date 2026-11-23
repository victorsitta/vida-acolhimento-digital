import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock3, HandHeart, HeartHandshake, MessageCircleHeart, ShieldCheck } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { HeroBanner } from "@/components/common/HeroBanner";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { applicationSchema, type ApplicationInput } from "@/utils/validators";
import { applicationService } from "@/services";
import { fmtDateTime } from "@/utils/format";
import { Field } from "./login";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/app/candidatura")({
  head: () => ({ meta: [{ title: "Quero ser voluntário — VIDA+" }] }),
  component: Page,
});

const STEPS = [
  { icon: HandHeart, title: "Conte sobre você", text: "Preencha o formulário com sua motivação e disponibilidade." },
  { icon: Clock3, title: "Análise da equipe", text: "Moderadores e administradores avaliam com cuidado e carinho." },
  { icon: MessageCircleHeart, title: "Comece a acolher", text: "Aprovado(a), seu painel de voluntário é liberado na hora." },
];

function Page() {
  useAuthGuard();
  const navigate = useNavigate();
  const mine = useQuery({ queryKey: ["my-application"], queryFn: applicationService.getMine, retry: false });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
    defaultValues: { candidateAlias: "", motivation: "", availability: "", experience: "" },
  });
  const m = useMutation({
    mutationFn: applicationService.submit,
    onSuccess: () => {
      toast.success("Candidatura enviada! A equipe vai analisar em breve.");
      navigate({ to: "/app" });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível enviar a candidatura. Tente novamente."),
  });

  const existing = mine.data;

  return (
    <AppShell>
      <HeroBanner
        icon={HeartHandshake}
        eyebrow="Faça parte"
        title="Seja voluntário(a) do VIDA+"
        description="Ofereça escuta a quem precisa. Você não precisa ser profissional: precisa de empatia, tempo e vontade de ajudar."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border bg-card p-5 shadow-soft sm:p-7">
          {mine.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : existing ? (
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-xl font-semibold">Sua candidatura</h2>
                <StatusBadge status={existing.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Enviada em {fmtDateTime(existing.submittedAt)}
              </p>
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="font-medium">Motivação</dt>
                  <dd className="mt-1 text-muted-foreground">{existing.motivation}</dd>
                </div>
                {existing.experience && (
                  <div>
                    <dt className="font-medium">Experiência e disponibilidade</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{existing.experience}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-5 flex items-start gap-2 rounded-2xl bg-primary/10 p-4 text-sm">
                {existing.status === "aprovado" ? (
                  <>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    Parabéns! Você já é voluntário(a). Saia e entre de novo para ver seu painel.
                  </>
                ) : existing.status === "recusado" ? (
                  <>Sua candidatura não foi aprovada neste momento. Obrigado por querer ajudar!</>
                ) : (
                  <>
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Sua candidatura está em análise. Avisaremos quando houver resposta.
                  </>
                )}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-4" noValidate>
              <h2 className="font-display text-xl font-semibold">Conte um pouco sobre você</h2>
              <Field label="Como gostaria de ser chamado(a)?" id="alias" error={errors.candidateAlias?.message}>
                <Input id="alias" {...register("candidateAlias")} />
              </Field>
              <Field label="O que te motiva a ser voluntário?" id="mot" error={errors.motivation?.message}>
                <Textarea id="mot" rows={4} {...register("motivation")} />
              </Field>
              <Field label="Disponibilidade" id="av" error={errors.availability?.message}>
                <Input id="av" placeholder="Ex: noites e finais de semana" {...register("availability")} />
              </Field>
              <Field label="Experiência (opcional)" id="exp" error={errors.experience?.message}>
                <Textarea id="exp" rows={3} {...register("experience")} />
              </Field>
              <Button type="submit" size="lg" disabled={m.isPending} className="w-full sm:w-auto">
                {m.isPending ? "Enviando…" : "Enviar candidatura"}
              </Button>
            </form>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-3xl border bg-card p-5 shadow-soft">
            <h2 className="font-display text-lg font-semibold">Como funciona</h2>
            <ol className="mt-4 space-y-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                    <s.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {i + 1}. {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="mt-2 text-sm font-semibold">Cuidamos de quem cuida</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Voluntários atendem com apoio da moderação e registram cada atendimento em prontuário
              confidencial.
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
