import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Níveis de espera: verde até 2 min, amarelo até 5, vermelho depois (como o SLA do Zendesk). */
export function waitLevel(ms: number) {
  const min = ms / 60000;
  return min < 2 ? "ok" : min < 5 ? "warn" : "late";
}

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${String(m % 60).padStart(2, "0")}min`;
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Relógio de espera que anda sozinho e muda de cor conforme a demora. */
export function WaitTimer({ since, className }: { since: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const ms = now - new Date(since).getTime();
  const level = waitLevel(ms);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
        level === "ok" && "bg-success/15 text-success",
        level === "warn" && "bg-warning/25 text-foreground",
        level === "late" && "animate-pulse bg-destructive/15 text-destructive",
        className,
      )}
      title={level === "late" ? "Espera longa: atenda esta pessoa primeiro" : "Tempo de espera"}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {fmt(ms)}
    </span>
  );
}
