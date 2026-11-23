import { useEffect, useState } from "react";
import {
  Accessibility,
  Eye,
  Focus,
  Link2,
  MousePointer2,
  Pause,
  RotateCcw,
  Sparkles,
  Type,
  WholeWord,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { applyA11y, DEFAULT_A11Y, loadA11y, saveA11y, type A11yPrefs } from "@/lib/a11y";
import { cn } from "@/lib/utils";

const SIZES: Array<{ id: A11yPrefs["font"]; label: string; sample: string }> = [
  { id: "normal", label: "Normal", sample: "A" },
  { id: "lg", label: "Grande", sample: "A" },
  { id: "xl", label: "Maior", sample: "A" },
  { id: "xxl", label: "Máximo", sample: "A" },
];

const TOGGLES: Array<{
  key: Exclude<keyof A11yPrefs, "font">;
  label: string;
  help: string;
  icon: typeof Eye;
}> = [
  { key: "contrast", label: "Alto contraste", help: "Cores mais fortes e bordas nítidas.", icon: Eye },
  { key: "dyslexia", label: "Fonte fácil de ler", help: "Letras mais abertas e distintas.", icon: WholeWord },
  { key: "spacing", label: "Espaçamento do texto", help: "Mais espaço entre linhas e letras.", icon: Type },
  { key: "links", label: "Destacar links", help: "Sublinha e realça tudo que é clicável.", icon: Link2 },
  { key: "focus", label: "Foco reforçado", help: "Contorno grosso no item selecionado.", icon: Focus },
  { key: "motion", label: "Reduzir animações", help: "Sem movimentos nem transições.", icon: Pause },
  { key: "calm", label: "Fundo simples", help: "Remove luzes e enfeites do fundo.", icon: Sparkles },
  { key: "cursor", label: "Cursor grande", help: "Ponteiro do mouse maior.", icon: MousePointer2 },
];

/** Menu de acessibilidade (ao lado do botão de tema). */
export function AccessibilityMenu() {
  const [prefs, setPrefs] = useState<A11yPrefs>(DEFAULT_A11Y);

  useEffect(() => {
    const p = loadA11y();
    setPrefs(p);
    applyA11y(p);
  }, []);

  const update = (patch: Partial<A11yPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveA11y(next);
  };
  const changed = JSON.stringify(prefs) !== JSON.stringify(DEFAULT_A11Y);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-11 w-11", changed && "text-primary")}
          aria-label="Menu de acessibilidade"
          data-tip="Acessibilidade: tamanho do texto, contraste e mais"
        >
          <Accessibility className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl p-0 shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Acessibilidade</p>
            <p className="text-xs text-muted-foreground">Ajuste o site ao seu jeito. Fica salvo.</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!changed}
            onClick={() => update({ ...DEFAULT_A11Y })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar
          </Button>
        </div>

        <div className="max-h-[70dvh] overflow-y-auto p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tamanho do texto
          </p>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Tamanho do texto">
            {SIZES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => update({ font: s.id })}
                aria-pressed={prefs.font === s.id}
                data-tip={s.label}
                className={cn(
                  "grid h-12 place-items-center rounded-xl border font-semibold transition hover:border-primary/50",
                  prefs.font === s.id ? "border-primary bg-primary/15 ring-1 ring-primary" : "bg-background",
                )}
                style={{ fontSize: `${0.9 + i * 0.25}rem` }}
              >
                {s.sample}
              </button>
            ))}
          </div>

          <ul className="mt-4 space-y-1">
            {TOGGLES.map(({ key, label, help, icon: Icon }) => (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{help}</span>
                  </span>
                  <Switch
                    checked={prefs[key]}
                    onCheckedChange={(v) => update({ [key]: v } as Partial<A11yPrefs>)}
                    aria-label={label}
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
