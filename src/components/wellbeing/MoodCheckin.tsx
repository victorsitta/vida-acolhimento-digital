import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flame, MessageCircleHeart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { wellbeingService, type MoodEntry } from "@/services";
import { cn } from "@/lib/utils";
import { celebrate } from "@/lib/celebrate";

export const MOODS = [
  { value: 1, emoji: "😞", label: "Muito mal", bar: "bg-destructive/70" },
  { value: 2, emoji: "😕", label: "Mal", bar: "bg-accent/70" },
  { value: 3, emoji: "😐", label: "Mais ou menos", bar: "bg-warning/80" },
  { value: 4, emoji: "🙂", label: "Bem", bar: "bg-success/70" },
  { value: 5, emoji: "😄", label: "Muito bem", bar: "bg-success" },
] as const;

const dayKey = (d: Date) => d.toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local

function lastDays(entries: MoodEntry[], n = 7) {
  const byDay = new Map<string, MoodEntry[]>();
  for (const e of entries) {
    const k = dayKey(new Date(e.createdAt));
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    const list = byDay.get(dayKey(d)) ?? [];
    const avg = list.length ? list.reduce((a, b) => a + b.mood, 0) / list.length : null;
    return {
      key: dayKey(d),
      label: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      avg,
      isToday: i === n - 1,
    };
  });
}

function streakOf(entries: MoodEntry[]) {
  const days = new Set(entries.map((e) => dayKey(new Date(e.createdAt))));
  let s = 0;
  const d = new Date();
  // se hoje ainda não tem check-in, a sequência conta a partir de ontem
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    s++;
    d.setDate(d.getDate() - 1);
  }
  return s;
}

/** Check-in diário de humor, gráfico dos últimos 7 dias e sequência de dias. */
export function MoodCheckin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mood"], queryFn: wellbeingService.list, retry: false });
  const entries = q.data ?? [];
  const streak = streakOf(entries);
  const todayDone = lastDays(entries)[6].avg !== null;
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: () => wellbeingService.save(picked!, note.trim() || undefined),
    onSuccess: () => {
      const next = streak + (todayDone ? 0 : 1);
      if (!todayDone && [3, 7, 14, 30].includes(next)) {
        celebrate();
        toast.success(`${next} dias seguidos cuidando de você! 🎉`);
      } else {
        toast.success("Check-in registrado. Obrigado por se cuidar 💛");
      }
      setNote("");
      qc.invalidateQueries({ queryKey: ["mood"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível registrar. Tente de novo."),
  });

  const week = lastDays(entries);
  const lowToday = (picked ?? 0) > 0 && (picked ?? 0) <= 2;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-soft sm:p-5" aria-labelledby="mood-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="mood-title" className="font-display text-base font-semibold">
            Como você está agora?
          </h2>
          <p className="text-sm text-muted-foreground">
            {todayDone ? "Você já fez o check-in de hoje. Pode registrar de novo se mudou." : "Um toque por dia já ajuda a perceber seus padrões."}
          </p>
        </div>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" /> {streak} dia{streak > 1 ? "s" : ""} seguido{streak > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Seu humor">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={picked === m.value}
            onClick={() => setPicked(m.value)}
            className={cn(
              "group flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/50 sm:p-3",
              picked === m.value ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/30" : "bg-background/60",
            )}
          >
            <span className="text-3xl transition-transform group-hover:scale-125 sm:text-4xl">{m.emoji}</span>
            <span className="text-[11px] font-medium leading-tight text-muted-foreground">{m.label}</span>
          </button>
        ))}
      </div>

      {picked && (
        <div className="pop-in mt-4 space-y-3">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Quer escrever algo sobre o seu dia? (opcional, só você vê)"
            maxLength={500}
          />
          <Button className="gap-2" disabled={save.isPending} onClick={() => save.mutate()}>
            <Sparkles className="h-4 w-4" /> {save.isPending ? "Salvando…" : "Registrar check-in"}
          </Button>
          {lowToday && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <MessageCircleHeart className="h-5 w-5 shrink-0 text-primary" />
              <p className="min-w-0 flex-1">Dias difíceis acontecem. Quer conversar com alguém agora?</p>
              <Button asChild size="sm">
                <Link to="/app/conversar">Falar com um voluntário</Link>
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Últimos 7 dias</p>
        {q.isPending ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <div className="flex h-32 items-end gap-2" role="img" aria-label="Gráfico do seu humor nos últimos 7 dias">
            {week.map((d) => {
              const m = d.avg ? MOODS[Math.min(4, Math.max(0, Math.round(d.avg) - 1))] : null;
              return (
                <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-base leading-none" aria-hidden="true">
                    {m?.emoji ?? ""}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={cn("w-full rounded-t-lg transition-all duration-700", m ? m.bar : "bg-muted")}
                      style={{ height: d.avg ? `${(d.avg / 5) * 100}%` : "6%" }}
                    />
                  </div>
                  <span className={cn("text-[11px] capitalize", d.isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
