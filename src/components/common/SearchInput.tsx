import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Barra de pesquisa padrão: ícone, campo limpo e botão "x" para apagar. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("group relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        className="flex h-10 w-full rounded-full border border-input bg-background/70 pl-9 pr-9 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/15"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
