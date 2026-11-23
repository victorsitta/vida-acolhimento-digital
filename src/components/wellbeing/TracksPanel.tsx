import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Lock, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trackService } from "@/services/features";
import { TRACKS, type Track } from "@/lib/tracks";
import { celebrate } from "@/lib/celebrate";
import { cn } from "@/lib/utils";


export function TracksPanel() {
  const qc = useQueryClient();
  const progress = useQuery({ queryKey: ["tracks"], queryFn: trackService.progress, retry: false });
  const [openId, setOpenId] = useState<string | null>(null);

  const done = (id: string) => new Set((progress.data ?? []).filter((p) => p.trackId === id).map((p) => p.day));
  const refresh = () => qc.invalidateQueries({ queryKey: ["tracks"] });

  const complete = useMutation({
    mutationFn: ({ id, day }: { id: string; day: number }) => trackService.complete(id, day),
    onSuccess: (_, v) => {
      const total = done(v.id).size + 1;
      if (total >= 7) {
        celebrate();
        toast.success("Você completou a trilha! 🎉 Que orgulho.");
      } else {
        toast.success(`Dia ${v.day} concluído. Continue no seu ritmo 💛`);
      }
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar o progresso."),
  });
  const undo = useMutation({ mutationFn: ({ id, day }: { id: string; day: number }) => trackService.undo(id, day), onSuccess: refresh });

  const track: Track | undefined = TRACKS.find((t) => t.id === openId);

  return (
    <>

      {!track ? (
        progress.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ul className="stagger grid gap-4 sm:grid-cols-2">
            {TRACKS.map((t) => {
              const n = done(t.id).size;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(t.id)}
                    className={cn("card-lift group flex h-full w-full flex-col rounded-3xl border bg-gradient-to-br p-5 text-left shadow-soft", t.tone)}
                  >
                    <span className="text-4xl transition-transform group-hover:scale-110">{t.emoji}</span>
                    <h2 className="mt-3 font-display text-lg font-semibold">{t.title}</h2>
                    <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.subtitle}</p>
                    <div className="mt-4">
                      <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
                        <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(n / 7) * 100}%` }} />
                      </div>
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                        {n === 7 ? (
                          <>
                            <Trophy className="h-3.5 w-3.5 text-primary" /> Concluída
                          </>
                        ) : n > 0 ? (
                          `${n} de 7 dias`
                        ) : (
                          "Começar"
                        )}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <section>
          <Button variant="ghost" size="sm" className="mb-3 gap-2" onClick={() => setOpenId(null)}>
            <ArrowLeft className="h-4 w-4" /> Todas as trilhas
          </Button>
          <div className={cn("mb-5 rounded-3xl border bg-gradient-to-br p-5 shadow-soft", track.tone)}>
            <span className="text-4xl">{track.emoji}</span>
            <h2 className="mt-2 font-display text-xl font-semibold">{track.title}</h2>
            <p className="text-sm text-muted-foreground">{track.subtitle}</p>
          </div>

          <ol className="space-y-3">
            {track.days.map((d, i) => {
              const day = i + 1;
              const set = done(track.id);
              const isDone = set.has(day);
              // libera o próximo dia depois de concluir o anterior (sem prazo: não existe atraso)
              const unlocked = day === 1 || set.has(day - 1) || isDone;
              return (
                <li key={day} className={cn("rounded-2xl border bg-card p-4 shadow-soft transition", !unlocked && "opacity-60", isDone && "border-success/40")}>
                  <div className="flex items-start gap-3">
                    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-base font-semibold", isDone ? "bg-success/20 text-success" : unlocked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                      {isDone ? <Check className="h-5 w-5" /> : unlocked ? day : <Lock className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">
                        Dia {day} · {d.title}
                      </h3>
                      {unlocked ? (
                        <>
                          <p className="mt-1 text-sm text-muted-foreground">{d.text}</p>
                          <p className="mt-2 rounded-xl bg-muted/60 p-3 text-sm">
                            <strong>Hoje: </strong>
                            {d.action}
                          </p>
                          <div className="mt-3">
                            {isDone ? (
                              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => undo.mutate({ id: track.id, day })}>
                                Desfazer
                              </Button>
                            ) : (
                              <Button size="sm" className="gap-2" disabled={complete.isPending} onClick={() => complete.mutate({ id: track.id, day })}>
                                <Check className="h-4 w-4" /> Marcar como feito
                              </Button>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">Conclua o dia anterior para liberar.</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">Conteúdo de apoio ao seu bem-estar. Não substitui acompanhamento profissional.</p>
        </section>
      )}
    </>
  );
}
