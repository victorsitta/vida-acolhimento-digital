import { createFileRoute, Link } from "@tanstack/react-router";
import { Ambulance, Building2, HeartHandshake, Hospital, LifeBuoy, Phone, ShieldAlert, Siren, Users2 } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { HeroBanner } from "@/components/common/HeroBanner";
import { Button } from "@/components/ui/button";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/app/ajuda")({
  head: () => ({ meta: [{ title: "Onde buscar ajuda — VIDA+" }] }),
  component: Page,
});

const CALLS = [
  { num: "188", name: "CVV", text: "Apoio emocional e prevenção do suicídio. 24 horas, gratuito.", icon: LifeBuoy, tone: "bg-destructive/15 text-destructive", main: true },
  { num: "192", name: "SAMU", text: "Emergência médica, inclusive crise psiquiátrica.", icon: Ambulance, tone: "bg-destructive/15 text-destructive", main: true },
  { num: "190", name: "Polícia Militar", text: "Quando há risco imediato de violência.", icon: Siren, tone: "bg-info/15 text-info" },
  { num: "193", name: "Bombeiros", text: "Resgate e situações de perigo físico.", icon: ShieldAlert, tone: "bg-accent/15 text-accent" },
  { num: "180", name: "Ligue 180", text: "Central de atendimento à mulher em situação de violência.", icon: HeartHandshake, tone: "bg-primary/15 text-primary" },
  { num: "100", name: "Disque 100", text: "Denúncias de violações de direitos humanos (crianças, idosos, pessoas com deficiência).", icon: Users2, tone: "bg-success/15 text-success" },
  { num: "136", name: "Disque Saúde", text: "Informações e orientações do Ministério da Saúde.", icon: Phone, tone: "bg-info/15 text-info" },
];

const PLACES = [
  { icon: Building2, title: "CAPS (Centro de Atenção Psicossocial)", text: "Atendimento gratuito pelo SUS para sofrimento emocional intenso. Procure o CAPS da sua cidade na prefeitura ou na UBS." },
  { icon: Hospital, title: "UPA 24h e pronto-socorro", text: "Em crise aguda ou risco, vá a uma UPA ou ao pronto-socorro mais próximo, a qualquer hora." },
  { icon: Users2, title: "UBS e CRAS", text: "A Unidade Básica de Saúde encaminha para psicólogo ou psiquiatra. O CRAS apoia famílias em situação de vulnerabilidade." },
];

function Page() {
  useAuthGuard();
  return (
    <AppShell>
      <HeroBanner
        icon={LifeBuoy}
        eyebrow="Você tem apoio"
        title="Onde buscar ajuda"
        description="Telefones gratuitos e lugares de atendimento no Brasil. Se estiver em risco agora, ligue 188 ou 192."
      />

      <section aria-labelledby="ligue">
        <h2 id="ligue" className="mb-3 font-display text-base font-semibold">
          Ligue agora
        </h2>
        <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {CALLS.map((c) => (
            <li key={c.num} className={`card-lift rounded-xl border bg-card p-4 shadow-soft ${c.main ? "border-destructive/30" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${c.tone}`}>
                  <c.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.text}</p>
                </div>
              </div>
              <Button asChild variant={c.main ? "destructive" : "outline"} className="mt-3 w-full gap-2">
                <a href={`tel:${c.num}`}>
                  <Phone className="h-4 w-4" /> Ligar {c.num}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6" aria-labelledby="locais">
        <h2 id="locais" className="mb-3 font-display text-base font-semibold">
          Onde ir pessoalmente
        </h2>
        <ul className="stagger grid gap-3 md:grid-cols-3">
          {PLACES.map((p) => (
            <li key={p.title} className="rounded-xl border bg-card p-4 shadow-soft">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <p.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-sm font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gradient-to-br from-primary/10 to-transparent p-4">
        <div>
          <p className="font-display text-base font-semibold">Quer um plano para os momentos difíceis?</p>
          <p className="text-sm text-muted-foreground">Monte o seu plano de segurança pessoal, só você vê.</p>
        </div>
        <Button asChild>
          <Link to="/app/plano-seguranca">Criar meu plano</Link>
        </Button>
      </section>
    </AppShell>
  );
}
