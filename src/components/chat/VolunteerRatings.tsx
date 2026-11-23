import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareQuote, Search, Smile, Star, ThumbsUp } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatCard } from "@/components/common/StatCard";
import { Pager, usePagination } from "@/components/common/Pager";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ratingService, type RatingRow } from "@/services";
import { fmtRelative } from "@/utils/format";
import { cn } from "@/lib/utils";

function Stars({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value.toFixed(1)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(size, n <= Math.round(value) ? "fill-primary text-primary" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}

interface Summary {
  id: string;
  name: string;
  count: number;
  avg: number;
  dist: number[]; // índice 0 = 1 estrela
  comments: RatingRow[];
  last: string;
}

function summarize(rows: RatingRow[]): Summary[] {
  const map = new Map<string, Summary>();
  for (const r of rows) {
    const s =
      map.get(r.volunteerId) ??
      { id: r.volunteerId, name: r.volunteerName, count: 0, avg: 0, dist: [0, 0, 0, 0, 0], comments: [], last: r.createdAt };
    s.count += 1;
    s.avg += r.rating;
    s.dist[r.rating - 1] += 1;
    if (r.comment) s.comments.push(r);
    if (r.createdAt > s.last) s.last = r.createdAt;
    map.set(r.volunteerId, s);
  }
  return [...map.values()]
    .map((s) => ({ ...s, avg: s.avg / s.count }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);
}

function VolunteerCard({ s }: { s: Summary }) {
  const [all, setAll] = useState(false);
  const shown = all ? s.comments : s.comments.slice(0, 2);
  return (
    <article className="card-lift rounded-3xl border bg-card p-5 shadow-soft">
      <header className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 font-display text-lg font-semibold text-primary">
          {s.name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-sans text-base font-semibold">{s.name}</h2>
          <p className="text-xs text-muted-foreground">
            {s.count} avaliaç{s.count > 1 ? "ões" : "ão"} · última {fmtRelative(s.last)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-semibold tabular-nums">{s.avg.toFixed(1)}</p>
          <Stars value={s.avg} size="h-3.5 w-3.5" />
        </div>
      </header>

      <div className="mt-4 space-y-1.5" aria-label="Distribuição das notas">
        {[5, 4, 3, 2, 1].map((n) => {
          const qtd = s.dist[n - 1];
          const pct = s.count ? (qtd / s.count) * 100 : 0;
          return (
            <div key={n} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-muted-foreground">{n}★</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-6 text-right tabular-nums text-muted-foreground">{qtd}</span>
            </div>
          );
        })}
      </div>

      {s.comments.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <MessageSquareQuote className="h-3.5 w-3.5" /> Comentários
          </p>
          {shown.map((c) => (
            <blockquote key={c.conversationId} className="rounded-xl bg-muted/60 p-3 text-sm">
              <p className="whitespace-pre-wrap">{c.comment}</p>
              <footer className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Stars value={c.rating} size="h-3 w-3" /> {c.userAlias} · {fmtRelative(c.createdAt)}
              </footer>
            </blockquote>
          ))}
          {s.comments.length > 2 && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {all ? "Mostrar menos" : `Ver todos (${s.comments.length})`}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Avaliações dos atendimentos: equipe vê todos os voluntários; voluntário vê só as próprias. */
export function VolunteerRatings({
  mine = false,
  source = "volunteers",
}: {
  mine?: boolean;
  source?: "volunteers" | "moderators";
}) {
  const q = useQuery({
    queryKey: ["ratings", source],
    queryFn: source === "moderators" ? ratingService.listModerators : ratingService.list,
  });
  const [term, setTerm] = useState("");

  const rows = q.data ?? [];
  const summaries = useMemo(() => summarize(rows), [rows]);
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? summaries.filter((s) => s.name.toLowerCase().includes(t)) : summaries;
  }, [summaries, term]);
  const pg = usePagination(filtered, 6);

  const total = rows.length;
  const avg = total ? rows.reduce((a, r) => a + r.rating, 0) / total : 0;
  const good = total ? Math.round((rows.filter((r) => r.rating >= 4).length / total) * 100) : 0;

  return (
    <>
      <PageHeader
        title={mine ? "Minhas avaliações" : source === "moderators" ? "Avaliações da moderação" : "Avaliações dos voluntários"}
        description={
          mine
            ? "O que as pessoas acolhidas acharam dos seus atendimentos."
            : source === "moderators"
              ? "Notas de quem denunciou sobre como a moderação tratou o caso."
              : "Notas e comentários deixados pelas pessoas após cada atendimento."
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Nota média" icon={Star} tone="primary" value={total ? avg.toFixed(1).replace(".", ",") : "—"} hint={total ? "de 5 estrelas" : "Ainda sem avaliações"} />
        <StatCard label="Avaliações" icon={Smile} tone="info" value={String(total)} />
        <StatCard label="Notas 4 e 5" icon={ThumbsUp} tone="success" value={total ? `${good}%` : "—"} hint="Atendimentos bem avaliados" />
      </div>

      {!mine && summaries.length > 1 && (
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar pelo nome" className="pl-9" aria-label="Buscar pelo nome" />
        </div>
      )}

      {q.isPending ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64 rounded-3xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Nenhuma avaliação ainda"
          description="Quando uma pessoa avaliar um atendimento (de 1 a 5 estrelas), a nota aparece aqui."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pg.pageItems.map((s) => (
            <VolunteerCard key={s.id} s={s} />
          ))}
        </div>
      )}
      <Pager {...pg} onPageChange={pg.setPage} />
    </>
  );
}
