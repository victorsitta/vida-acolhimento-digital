import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-1 items-start gap-4 pb-6 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="mb-3 h-1 w-10 rounded-full bg-gradient-to-r from-primary to-accent" aria-hidden="true" />
        <h1 className="font-display text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  );
}
