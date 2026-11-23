import { useState, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StartItem {
  id: string;
  label: string;
  hint: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** se vier do banco, é automático; se não, a pessoa marca ao concluir */
  done?: boolean;
}

function read(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

/** "Primeiros passos": lista curta com progresso. Some quando tudo foi feito ou for dispensada. */
export function GettingStarted({ storageKey, title, items }: { storageKey: string; title: string; items: StartItem[] }) {
  const [manual, setManual] = useState<string[]>(() => read(`${storageKey}:done`));
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`${storageKey}:hidden`) === "1";
    } catch {
      return false;
    }
  });

  const isDone = (i: StartItem) => i.done === true || manual.includes(i.id);
  const doneCount = items.filter(isDone).length;
  if (hidden || doneCount === items.length) return null;

  const mark = (id: string) => {
    const next = Array.from(new Set([...manual, id]));
    setManual(next);
    try {
      localStorage.setItem(`${storageKey}:done`, JSON.stringify(next));
    } catch {
      /* ok */
    }
  };
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(`${storageKey}:hidden`, "1");
    } catch {
      /* ok */
    }
  };
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <section className="mb-4 rounded-xl border bg-card p-3 shadow-soft sm:p-4" aria-labelledby={`${storageKey}-t`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${storageKey}-t`} className="font-display text-base font-semibold">
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">
            {doneCount} de {items.length} feitos
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar primeiros passos"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>

      <ul className="stagger mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((i) => {
          const done = isDone(i);
          return (
            <li key={i.id}>
              <Link
                to={i.to as never}
                onClick={() => !done && i.done === undefined && mark(i.id)}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg border p-2 transition-all hover:-translate-y-0.5 hover:border-primary/50",
                  done ? "bg-success/5 opacity-70" : "bg-background/60",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    done ? "bg-success/20 text-success" : "bg-primary/15 text-primary",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : <i.icon className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-medium", done && "line-through")}>{i.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{i.hint}</span>
                </span>
                {!done && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
