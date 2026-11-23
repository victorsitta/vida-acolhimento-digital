import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Palette, Send, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STICKERS: Array<{ group: string; items: string[] }> = [
  { group: "Carinho", items: ["🤗", "💛", "🫶", "🥰", "💞", "🌷", "🫂", "😊"] },
  { group: "Força", items: ["💪", "🌟", "✨", "🔥", "🏆", "🙌", "👏", "🚀"] },
  { group: "Calma", items: ["🌿", "🌈", "☀️", "🌙", "🍃", "🌊", "☕", "🧘"] },
  { group: "Gratidão", items: ["🙏", "🌻", "🎁", "💐", "🤝", "👍", "😌", "🥹"] },
];

const THEMES = [
  { id: "ouro", label: "Dourado", from: "", to: "", fg: "" },
  { id: "oceano", label: "Oceano", from: "oklch(0.58 0.12 240)", to: "oklch(0.5 0.12 255)", fg: "white" },
  { id: "floresta", label: "Floresta", from: "oklch(0.56 0.11 155)", to: "oklch(0.48 0.1 170)", fg: "white" },
  { id: "rosa", label: "Rosa", from: "oklch(0.64 0.14 5)", to: "oklch(0.56 0.14 350)", fg: "white" },
  { id: "lavanda", label: "Lavanda", from: "oklch(0.6 0.13 295)", to: "oklch(0.52 0.14 280)", fg: "white" },
];
const THEME_KEY = "vida:chat-theme";

function initialsOf(text: string) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export interface ChatRoomProps {
  title: string;
  subtitle?: ReactNode;
  /** texto usado nas iniciais do avatar (padrão: o título) */
  avatarText?: string;
  /** link/botão acima do título (ex.: "← Todos os grupos") */
  back?: ReactNode;
  /** botões extras do cabeçalho (prontuário, risco, denunciar…) */
  actions?: ReactNode;
  /** ação principal de saída: encerrar atendimento / sair do grupo */
  onEnd?: () => void;
  endLabel?: string;
  /** painel opcional logo abaixo do cabeçalho (ex.: sinalizar risco) */
  panel?: ReactNode;
  /** aviso fixo de confidencialidade */
  notice?: string;
  /** muda quando chegam mensagens, para rolar até o fim */
  scrollKey?: number | string;
  /** mensagens (use ChatBubble) */
  children: ReactNode;
  /** indicador "digitando…" */
  typing?: ReactNode;
  /** faixa "respondendo a…" */
  replyBar?: ReactNode;
  composer: {
    value: string;
    onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
    onSubmit: () => void;
    placeholder?: string;
    sending?: boolean;
    disabled?: boolean;
    maxLength?: number;
    hint?: string;
    /** envia uma figurinha (já no formato "::sticker::🤗") */
    onSticker?: (sticker: string) => void;
  };
  className?: string;
}

/**
 * Estrutura única de TODAS as telas de chat (usuário, voluntário e grupos):
 * mesmo cabeçalho, mesmos botões, mesma área de mensagens com rolagem e mesmo campo de envio.
 */
export function ChatRoom({
  title,
  subtitle,
  avatarText,
  back,
  actions,
  onEnd,
  endLabel = "Encerrar",
  panel,
  notice,
  scrollKey,
  children,
  typing,
  replyBar,
  composer,
  className,
}: ChatRoomProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [themeId, setThemeId] = useState<string>(() => {
    try {
      return localStorage.getItem(THEME_KEY) || "ouro";
    } catch {
      return "ouro";
    }
  });
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const chooseTheme = (id: string) => {
    setThemeId(id);
    setShowThemes(false);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  };

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [scrollKey]);

  const canSend = composer.value.trim().length > 0 && !composer.sending && !composer.disabled;

  return (
    <section
      className={cn(
        "flex h-[calc(100dvh-13rem)] min-h-[28rem] flex-col overflow-hidden rounded-3xl border bg-card shadow-soft",
        className,
      )}
      style={
        theme.from
          ? ({ "--bubble-from": theme.from, "--bubble-to": theme.to, "--bubble-fg": theme.fg } as React.CSSProperties)
          : undefined
      }
    >
      {/* Cabeçalho */}
      <header className="border-b bg-gradient-to-b from-primary/10 to-transparent px-4 py-3 sm:px-5">
        {back && <div className="mb-1 text-xs font-medium text-primary">{back}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initialsOf(avatarText ?? title)}
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-sm font-semibold tracking-normal sm:text-base">
                {title}
              </h1>
              {subtitle && (
                <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <span className="live-dot shrink-0" aria-hidden="true" />
                  <span className="truncate">{subtitle}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {actions}
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowThemes(!showThemes)}
                aria-label="Cor das mensagens"
                aria-expanded={showThemes}
              >
                <Palette className="h-4 w-4" />
              </Button>
              {showThemes && (
                <div className="pop-in absolute right-0 top-11 z-20 w-44 rounded-2xl border bg-popover p-2 shadow-xl">
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Cor das suas mensagens
                  </p>
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => chooseTheme(t.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted",
                        t.id === themeId && "bg-muted font-medium",
                      )}
                    >
                      <span
                        className="h-4 w-4 rounded-full border"
                        style={{ background: t.from ? `linear-gradient(135deg, ${t.from}, ${t.to})` : "var(--primary)" }}
                      />
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {onEnd && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onEnd}
                className="gap-1.5 hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">{endLabel}</span>
                <span className="sr-only sm:hidden">{endLabel}</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {panel}

      {notice && (
        <p role="note" className="bg-muted/50 px-4 py-1.5 text-center text-xs text-muted-foreground">
          {notice}
        </p>
      )}

      {/* Mensagens */}
      <div
        ref={bodyRef}
        className="chat-bg min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
        aria-live="polite"
      >
        <div className="flex flex-col gap-3">{children}</div>
      </div>

      {/* Campo de envio */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) composer.onSubmit();
        }}
        className="border-t bg-card px-3 py-3 safe-bottom sm:px-4"
      >
        {typing}
        {replyBar}
        {showStickers && composer.onSticker && (
          <div className="pop-in mb-2 max-h-52 overflow-y-auto rounded-2xl border bg-popover p-3 shadow-lg">
            {STICKERS.map((g) => (
              <div key={g.group} className="mb-2 last:mb-0">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.group}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {g.items.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        composer.onSticker?.(`::sticker::${emoji}`);
                        setShowStickers(false);
                      }}
                      className="grid aspect-square place-items-center rounded-xl text-2xl transition hover:scale-125 hover:bg-muted active:scale-95"
                      aria-label={`Enviar figurinha ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          {composer.onSticker && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-2xl"
              onClick={() => setShowStickers(!showStickers)}
              aria-label="Figurinhas"
              aria-expanded={showStickers}
              disabled={composer.disabled}
            >
              <Smile className="h-5 w-5" />
            </Button>
          )}
          <label htmlFor="chat-message" className="sr-only">
            Mensagem
          </label>
          <Textarea
            id="chat-message"
            rows={1}
            value={composer.value}
            onChange={composer.onChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) composer.onSubmit();
              }
            }}
            placeholder={composer.placeholder ?? "Escreva uma mensagem…"}
            maxLength={composer.maxLength ?? 2000}
            disabled={composer.disabled}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl"
          />
          <Button
            type="submit"
            disabled={!canSend}
            className="h-11 shrink-0 gap-2 rounded-2xl px-4"
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Enviar</span>
          </Button>
        </div>
        {composer.hint && <p className="mt-2 text-xs text-muted-foreground">{composer.hint}</p>}
      </form>
    </section>
  );
}
