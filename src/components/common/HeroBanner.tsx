import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Sparkles, Sun, Moon, Sunset } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return { text: "Boa madrugada", Icon: Moon };
  if (h < 12) return { text: "Bom dia", Icon: Sun };
  if (h < 18) return { text: "Boa tarde", Icon: Sunset };
  return { text: "Boa noite", Icon: Moon };
}

/**
 * Cabeçalho de boas-vindas das telas principais: fundo em gradiente com luzes
 * que flutuam devagar, ícone decorativo e saudação conforme a hora do dia.
 */
export function HeroBanner({
  title,
  description,
  actions,
  icon: Icon = Sparkles,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
  /** texto pequeno acima do título (padrão: saudação pela hora) */
  eyebrow?: string;
}) {
  const g = greeting();
  return (
    <section className="hero relative mb-8 overflow-hidden rounded-3xl border p-6 shadow-soft sm:p-8">
      <span className="blob blob-a" aria-hidden="true" />
      <span className="blob blob-b" aria-hidden="true" />
      <span className="hero-dots" aria-hidden="true" />

      <Icon
        className="float-y pointer-events-none absolute -right-2 -top-2 h-32 w-32 text-primary/15 sm:h-44 sm:w-44"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 max-w-2xl">
          <p className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <g.Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {eyebrow ?? g.text}
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-xl text-sm text-muted-foreground text-pretty sm:text-base">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}
