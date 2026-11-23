import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Clock, Flame, HeartHandshake, MessageCircleHeart, Printer, Star, Trophy } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { HeroBanner } from "@/components/common/HeroBanner";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { chatService, ratingService, userService } from "@/services";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/vol/impacto")({
  head: () => ({ meta: [{ title: "Meu impacto — VIDA+" }] }),
  component: Page,
});

function fmtHours(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${String(min % 60).padStart(2, "0")}min`;
}

function Page() {
  useAuthGuard();
  const me = useQuery({ queryKey: ["me"], queryFn: userService.me });
  const convs = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations, retry: false });
  const ratings = useQuery({ queryKey: ["ratings", "volunteers"], queryFn: ratingService.list, retry: false });

  const done = (convs.data ?? []).filter((c) => !c.isTeamChat && c.status === "ended" && c.volunteerAlias !== undefined);
  const minutes = Math.round(
    done.reduce((sum, c) => (c.endedAt ? sum + Math.max(0, (new Date(c.endedAt).getTime() - new Date(c.startedAt).getTime()) / 60000) : sum), 0),
  );
  const r = ratings.data ?? [];
  const avg = r.length ? r.reduce((a, b) => a + b.rating, 0) / r.length : 0;
  const fiveStars = r.filter((x) => x.rating === 5).length;

  // dias seguidos com atendimento
  const days = new Set(done.map((c) => new Date(c.startedAt).toDateString()));
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    streak++;
    d.setDate(d.getDate() - 1);
  }

  const BADGES = [
    { id: "primeiro", icon: MessageCircleHeart, title: "Primeira escuta", text: "Concluiu o 1º atendimento", ok: done.length >= 1 },
    { id: "dez", icon: HeartHandshake, title: "10 atendimentos", text: "Dez pessoas acolhidas", ok: done.length >= 10 },
    { id: "cinquenta", icon: Trophy, title: "50 atendimentos", text: "Um pilar da comunidade", ok: done.length >= 50 },
    { id: "cinco", icon: Star, title: "Nota máxima", text: "Recebeu 5 estrelas", ok: fiveStars >= 1 },
    { id: "excelente", icon: Award, title: "Excelência", text: "Média 4,5+ em 10 avaliações", ok: r.length >= 10 && avg >= 4.5 },
    { id: "horas", icon: Clock, title: "10 horas", text: "Dez horas de escuta", ok: minutes >= 600 },
    { id: "sequencia", icon: Flame, title: "Constância", text: "3 dias seguidos atendendo", ok: streak >= 3 },
  ];
  const earned = BADGES.filter((b) => b.ok).length;
  const name = me.data?.name ?? "Voluntário(a)";

  return (
    <AppShell>
      <div className="print:hidden">
        <HeroBanner
          icon={Award}
          eyebrow="Obrigado por cuidar"
          title="Meu impacto"
          description="Cada conversa faz diferença. Aqui está o que você já construiu."
          actions={
            <Button variant="outline" className="gap-2" onClick={() => window.print()} disabled={done.length === 0}>
              <Printer className="h-4 w-4" /> Certificado
            </Button>
          }
        />

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Pessoas acolhidas" icon={HeartHandshake} tone="primary" value={String(done.length)} />
          <StatCard label="Horas de escuta" icon={Clock} tone="info" value={fmtHours(minutes)} />
          <StatCard label="Nota média" icon={Star} tone="accent" value={r.length ? avg.toFixed(1).replace(".", ",") : "—"} hint={r.length ? `${r.length} avaliações` : "Sem avaliações"} />
          <StatCard label="Dias seguidos" icon={Flame} tone="success" value={String(streak)} />
        </div>

        <section aria-labelledby="selos">
          <h2 id="selos" className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
            Selos <span className="text-sm font-normal text-muted-foreground">({earned} de {BADGES.length})</span>
          </h2>
          <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BADGES.map((b) => (
              <li key={b.id} className={cn("rounded-2xl border p-4 text-center shadow-soft transition", b.ok ? "card-lift bg-card" : "bg-muted/40 opacity-60")}>
                <span className={cn("mx-auto grid h-11 w-11 place-items-center rounded-xl", b.ok ? "bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground")}>
                  <b.icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm font-semibold">{b.title}</p>
                <p className="text-xs text-muted-foreground">{b.ok ? b.text : `Falta: ${b.text.toLowerCase()}`}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Certificado: só aparece ao imprimir / salvar em PDF */}
      <div className="hidden print:block">
        <div className="mx-auto max-w-3xl border-8 border-double border-amber-500 p-12 text-center text-black">
          <p className="text-sm uppercase tracking-[0.3em]">VIDA+ · Acolhimento digital</p>
          <h1 className="mt-6 font-display text-5xl font-semibold">Certificado de Voluntariado</h1>
          <p className="mt-6 text-lg">Certificamos que</p>
          <p className="mt-2 font-display text-4xl font-semibold">{name}</p>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed">
            atuou como voluntário(a) de escuta emocional, acolhendo <strong>{done.length}</strong>{" "}
            {done.length === 1 ? "pessoa" : "pessoas"} em <strong>{fmtHours(minutes)}</strong> de atendimento
            {r.length ? `, com nota média ${avg.toFixed(1).replace(".", ",")} de 5` : ""}.
          </p>
          <p className="mt-6 text-sm">
            Emitido em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
          <p className="mt-12 text-xs text-neutral-600">Documento gerado pela plataforma VIDA+. Os números refletem os atendimentos registrados no sistema.</p>
        </div>
      </div>
    </AppShell>
  );
}
