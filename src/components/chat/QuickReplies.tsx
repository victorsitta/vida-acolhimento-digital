import { useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const KEY = "vida:quick-replies";
const DEFAULTS = [
  "Oi! Eu sou voluntário(a) do VIDA+. Estou aqui para te ouvir. Como você está?",
  "Obrigado(a) por confiar em mim para contar isso.",
  "Você não está sozinho(a). Quer me contar mais?",
  "Vamos respirar juntos: inspire por 4 segundos, segure 4 e solte em 6.",
  "Vou ficar aqui com você pelo tempo que precisar.",
  "Se você estiver em risco agora, ligue 188 (CVV) ou 192 (SAMU).",
];

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : null;
    return Array.isArray(list) && list.length ? list : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Respostas rápidas do voluntário (ficam salvas neste navegador e podem ser editadas). */
export function QuickReplies({ onPick }: { onPick: (text: string) => void }) {
  const [items, setItems] = useState<string[]>(load);
  const [draft, setDraft] = useState("");

  const save = (next: string[]) => {
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ok */
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Respostas rápidas"
          data-tip="Respostas rápidas"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-primary"
        >
          <Zap className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl p-0 shadow-xl">
        <p className="border-b px-4 py-3 text-sm font-semibold">Respostas rápidas</p>
        <ul className="max-h-60 divide-y overflow-y-auto">
          {items.map((t, i) => (
            <li key={`${i}-${t}`} className="group flex items-start gap-1 hover:bg-muted/50">
              <button type="button" onClick={() => onPick(t)} className="min-w-0 flex-1 px-4 py-2.5 text-left text-sm leading-snug">
                {t}
              </button>
              <button
                type="button"
                onClick={() => save(items.filter((_, j) => j !== i))}
                aria-label="Remover resposta"
                className="mr-2 mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 max-md:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex items-center gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (t) {
              save([...items, t]);
              setDraft("");
            }
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nova resposta rápida…"
            maxLength={300}
            className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button type="submit" aria-label="Adicionar" className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Plus className="h-4 w-4" />
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
