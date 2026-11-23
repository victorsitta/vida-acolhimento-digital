import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  HeartPulse,
  HeartHandshake,
  History,
  Inbox,
  Lightbulb,
  MessageCircleHeart,
  Phone,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { UserChecklist } from "@/components/common/RoleBlocks";
import { HeroBanner } from "@/components/common/HeroBanner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { chatService, userService } from "@/services";
import { fmtDate, fmtRelative } from "@/utils/format";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Início — VIDA+" }] }),
  component: Page,
});

const TIPS = [
  "Respire fundo: inspire 4 segundos, segure 4 e solte em 6. Repita 5 vezes.",
  "Beber água e dar uma pequena caminhada já ajudam a organizar os pensamentos.",
  "Falar sobre o que sente não é fraqueza. É um jeito de cuidar de você.",
  "Dormir bem muda tudo. Que tal desligar as telas 30 minutos antes de deitar?",
];

function Tile({
  to,
  icon: Icon,
  title,
  text,
  tone,
  featured,
}: {
  to: string;
  icon: typeof History;
  title: string;
  text: string;
  tone: string;
  featured?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "tile card-lift group flex items-center gap-2.5 rounded-xl border p-3 shadow-soft",
        featured ? "bg-gradient-to-br from-primary/90 to-primary/70 text-primary-foreground" : "bg-card",
      )}
    >
      <span
        className={cn(
          "tile-icon grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          featured ? "bg-primary-foreground/20" : tone,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className={cn("block truncate text-xs", featured ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {text}
        </span>
      </span>
      <ArrowRight className="tile-arrow h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

function Page() {
  useAuthGuard();
  const me = useQuery({ queryKey: ["me"], queryFn: userService.me });
  const conv = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations });
  const first = me.data?.name?.split(" ")[0];
  const recent = (conv.data ?? []).filter((c) => !c.isTeamChat).slice(0, 4);
  const tip = TIPS[new Date().getDate() % TIPS.length];

  return (
    <AppShell>
      <HeroBanner
        icon={HeartHandshake}
        title={me.isPending ? "Olá!" : `Olá, ${first ?? "por aqui"}!`}
        description="Como você está se sentindo hoje? Se quiser conversar, estamos aqui."
        actions={
          <Button asChild size="lg" className="gap-2">
            <Link to="/app/conversar">
              <MessageCircleHeart className="h-4 w-4" /> Conversar agora
            </Link>
          </Button>
        }
      />

      {(() => {
        const live = (conv.data ?? []).find((c) => c.status === "active" && !c.isTeamChat);
        const waiting = (conv.data ?? []).find((c) => c.status === "waiting" && !c.isTeamChat);
        if (!live && !waiting) return null;
        return (
          <Link
            to={live ? "/app/chat/$id" : "/app/conversar"}
            params={live ? { id: live.id } : undefined}
            className="card-lift mb-6 flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-4 shadow-soft"
          >
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-success/20 text-success">
              <MessageCircleHeart className="h-5 w-5" />
              <span className="live-dot absolute -right-0.5 -top-0.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{live ? "Você tem uma conversa em andamento" : "Você está na fila de espera"}</span>
              <span className="block text-xs text-muted-foreground">{live ? "Toque para voltar à conversa." : "Toque para acompanhar a sua posição."}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Link>
        );
      })()}

      <UserChecklist />


      <div className="stagger grid gap-3 sm:grid-cols-3">
        <Tile
          to="/app/conversar"
          icon={MessageCircleHeart}
          title="Conversar agora"
          text="Fale com um voluntário"
          tone=""
          featured
        />
        <Tile to="/app/comunidades" icon={UsersRound} title="Grupos de apoio" text="Converse em comunidade" tone="bg-info/15 text-info" />
        <Tile to="/app/bem-estar" icon={HeartPulse} title="Bem-estar" text="Humor, respiração e dicas" tone="bg-success/15 text-success" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="recentes">
          <h2 id="recentes" className="mb-3 font-display text-base font-semibold">
            Atividade recente
          </h2>
          <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
            {conv.isPending && (
              <div className="space-y-2 p-4" aria-label="Carregando atividade recente">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            )}
            {!conv.isPending && recent.length === 0 && (
              <div className="flex flex-col items-center p-8 text-center">
                <span className="float-y grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary ring-8 ring-primary/5">
                  <Inbox className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-medium">Sem conversas ainda</p>
                <p className="text-xs text-muted-foreground">Quando você conversar, o histórico aparece aqui.</p>
              </div>
            )}
            <ul className="timeline stagger divide-y">
              {recent.map((c) => (
                <li key={c.id} className="row-hover flex items-center gap-3 px-4 py-3">
                  <span
                    className={cn(
                      "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-card",
                      c.status === "active" ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {c.status === "active" ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.volunteerAlias ?? "Atendimento emocional"}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(c.startedAt)} · {fmtRelative(c.startedAt)}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-4 shadow-soft">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Lightbulb className="h-4 w-4 text-primary" /> Dica de hoje
            </p>
            <p className="mt-2 text-sm leading-relaxed text-pretty">{tip}</p>
          </section>

          <section className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Phone className="h-4 w-4 text-destructive" /> Precisa de ajuda agora?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ligue <strong className="text-foreground">188</strong> (CVV, 24h) ou{" "}
              <strong className="text-foreground">192</strong> (SAMU).
            </p>
          </section>

          <section className="rounded-2xl border bg-gradient-to-br from-primary/10 to-transparent p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <HeartHandshake className="h-4 w-4 text-primary" /> Quer ajudar quem precisa?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Torne-se voluntário e ofereça escuta a outras pessoas.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/app/candidatura">Quero ser voluntário</Link>
            </Button>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
