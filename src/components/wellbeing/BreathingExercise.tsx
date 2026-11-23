import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { celebrate } from "@/lib/celebrate";

type Phase = { id: "in" | "hold" | "out"; label: string; seconds: number; scale: number };

const TECHNIQUES: Array<{ id: string; name: string; hint: string; phases: Phase[] }> = [
  {
    id: "464",
    name: "4-4-6 (calma)",
    hint: "Ótima para acalmar a ansiedade em poucos minutos.",
    phases: [
      { id: "in", label: "Inspire", seconds: 4, scale: 1 },
      { id: "hold", label: "Segure", seconds: 4, scale: 1 },
      { id: "out", label: "Solte devagar", seconds: 6, scale: 0.55 },
    ],
  },
  {
    id: "box",
    name: "Respiração quadrada",
    hint: "Quatro tempos iguais. Ajuda a focar a mente.",
    phases: [
      { id: "in", label: "Inspire", seconds: 4, scale: 1 },
      { id: "hold", label: "Segure", seconds: 4, scale: 1 },
      { id: "out", label: "Solte", seconds: 4, scale: 0.55 },
      { id: "hold", label: "Pausa", seconds: 4, scale: 0.55 },
    ],
  },
  {
    id: "478",
    name: "4-7-8 (sono)",
    hint: "Boa para desacelerar antes de dormir.",
    phases: [
      { id: "in", label: "Inspire", seconds: 4, scale: 1 },
      { id: "hold", label: "Segure", seconds: 7, scale: 1 },
      { id: "out", label: "Solte", seconds: 8, scale: 0.55 },
    ],
  },
];

/** Respiração guiada: o círculo cresce e encolhe no ritmo, com a instrução e a contagem na tela. */
export function BreathingExercise() {
  const [techId, setTechId] = useState("464");
  const tech = TECHNIQUES.find((t) => t.id === techId) ?? TECHNIQUES[0];
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [left, setLeft] = useState(tech.phases[0].seconds);
  const [cycles, setCycles] = useState(0);
  const timer = useRef<number | null>(null);

  const phase = tech.phases[step % tech.phases.length];

  useEffect(() => {
    if (cycles === 3) celebrate();
  }, [cycles]);

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => {
      setLeft((l) => {
        if (l > 1) return l - 1;
        // próxima fase
        setStep((s) => {
          const next = (s + 1) % tech.phases.length;
          if (next === 0) setCycles((c) => c + 1);
          setLeft(tech.phases[next].seconds);
          return next;
        });
        return 0;
      });
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running, tech]);

  const reset = () => {
    setRunning(false);
    setStep(0);
    setLeft(tech.phases[0].seconds);
    setCycles(0);
  };

  const scale = running ? phase.scale : 0.7;
  const dur = running ? phase.seconds : 0.6;

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-soft sm:p-6" aria-labelledby="resp-title">
      <h2 id="resp-title" className="font-display text-lg font-semibold">
        Respiração guiada
      </h2>
      <p className="text-sm text-muted-foreground">{tech.hint}</p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Técnica de respiração">
        {TECHNIQUES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTechId(t.id);
              setRunning(false);
              setStep(0);
              setLeft(t.phases[0].seconds);
              setCycles(0);
            }}
            aria-pressed={t.id === techId}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
              t.id === techId ? "border-primary bg-primary text-primary-foreground" : "bg-background/70 text-muted-foreground hover:border-primary/50",
            )}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="relative mx-auto mt-6 grid h-64 w-64 place-items-center sm:h-72 sm:w-72">
        <span className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" aria-hidden="true" />
        <span
          className="absolute inset-3 rounded-full border-2 border-dashed border-primary/30"
          aria-hidden="true"
        />
        <span
          className="absolute inset-6 rounded-full bg-gradient-to-br from-primary/60 to-accent/50 shadow-glow"
          style={{
            transform: `scale(${scale})`,
            transition: `transform ${dur}s ease-in-out`,
          }}
          aria-hidden="true"
        />
        <div className="relative z-10 text-center" aria-live="polite">
          <p className="font-display text-2xl font-semibold">{running ? phase.label : "Pronto?"}</p>
          <p className="mt-1 font-display text-5xl font-semibold tabular-nums">{running ? left : "·"}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <Button size="lg" className="gap-2 rounded-full px-8" onClick={() => setRunning(!running)}>
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? "Pausar" : cycles > 0 ? "Continuar" : "Começar"}
        </Button>
        <Button variant="outline" size="icon" className="rounded-full" onClick={reset} aria-label="Recomeçar" disabled={!running && cycles === 0 && step === 0}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {cycles > 0 ? `${cycles} ciclo${cycles > 1 ? "s" : ""} completo${cycles > 1 ? "s" : ""}. Continue até se sentir mais calmo(a).` : "Sente-se confortável, ombros soltos. Siga o círculo."}
      </p>
    </section>
  );
}
