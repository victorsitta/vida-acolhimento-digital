import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Anima de 0 até o número do texto (ex.: "1.234", "98%", "12 min"). Texto sem número não anima. */
export function CountUp({ value }: { value: string }) {
  const match = value.match(/^(\D*)([\d.,]+)(.*)$/);
  const target = match ? Number(match[2].replace(/\./g, "").replace(",", ".")) : NaN;
  const [shown, setShown] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!match || Number.isNaN(target)) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (target - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!match || Number.isNaN(target)) return <>{value}</>;
  const decimals = match[2].includes(",") ? match[2].split(",")[1].length : 0;
  return (
    <>
      {match[1]}
      {shown.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {match[3]}
    </>
  );
}

/** Cartão de métrica com ícone, número animado e brilho ao passar o mouse. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "primary",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  tone?: "primary" | "accent" | "success" | "info";
}) {
  const toneClass = {
    primary: "bg-primary/15 text-primary",
    accent: "bg-accent/15 text-accent",
    success: "bg-success/15 text-success",
    info: "bg-info/15 text-info",
  }[tone];
  const glow = {
    primary: "bg-primary/25",
    accent: "bg-accent/25",
    success: "bg-success/25",
    info: "bg-info/25",
  }[tone];

  return (
    <div className="card-lift group relative overflow-hidden rounded-xl border bg-card p-3 shadow-soft">
      <div
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-60 blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-100",
          glow,
        )}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 font-display text-xl font-semibold tabular-nums leading-tight">
            <CountUp value={value} />
          </p>
          {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110",
              toneClass,
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}
