import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode } from "react";
import { ChevronDown, Palette, Send, Smile, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { chatService } from "@/services";
import { detectRisk } from "@/lib/risk";
import { RiskSupport } from "@/components/chat/RiskSupport";
import { ChatThemeContext, THEMES, themeById } from "@/components/chat/chatThemes";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STICKERS: Array<{ group: string; items: string[] }> = [
  { group: "Carinho", items: ["🤗", "💛", "🫶", "🥰", "💞", "🌷", "🫂", "😊"] },
  { group: "Força", items: ["💪", "🌟", "✨", "🔥", "🏆", "🙌", "👏", "🚀"] },
  { group: "Calma", items: ["🌿", "🌈", "☀️", "🌙", "🍃", "🌊", "☕", "🧘"] },
  { group: "Gratidão", items: ["🙏", "🌻", "🎁", "💐", "🤝", "👍", "😌", "🥹"] },
];

const THEME_KEY = "vida:chat-theme";

const EMOJI_GROUPS: Array<{ icon: string; label: string; items: string[] }> = [
  {
    icon: "😀",
    label: "Carinhas",
    items: "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤔 🫡 😐 😑 😶 😏 😒 🙄 😬 😔 😪 😴 😷 🤒 🥵 🥶 🥴 😵 🤯 🥳 😎 🤓 😕 😟 🙁 😮 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠".split(" "),
  },
  {
    icon: "👍",
    label: "Gestos",
    items: "👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 ✋ 🖖 👏 🙌 🫶 👐 🤲 🤝 🙏 💪 🫂 ✍️ 🤳".split(" "),
  },
  {
    icon: "❤️",
    label: "Corações",
    items: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝 ✨ 🌟 ⭐ 💫 🔥 🎉 🎊 🎁".split(" "),
  },
  {
    icon: "🌿",
    label: "Natureza",
    items: "🌸 🌼 🌻 🌷 🌹 🌿 🍀 🌈 ☀️ 🌙 ☁️ 🌊 🍃 🌳 🦋 🐶 🐱 🐻 🐼 🦊 🐢 🕊️ ☕ 🍫 🍎".split(" "),
  },
];

/** Seletor estilo WhatsApp: aba de emojis (vão para o texto) e aba de figurinhas (enviam na hora). */
function Picker({ onEmoji, onSticker }: { onEmoji: (e: string) => void; onSticker?: (s: string) => void }) {
  const [tab, setTab] = useState<"emoji" | "sticker">("emoji");
  const [group, setGroup] = useState(0);
  return (
    <div className="pop-in mb-2 overflow-hidden rounded-2xl border bg-popover shadow-lg">
      <div className="flex items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setTab("emoji")}
          className={cn("rounded-full px-3 py-1 text-xs font-medium transition", tab === "emoji" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/60")}
        >
          Emojis
        </button>
        {onSticker && (
          <button
            type="button"
            onClick={() => setTab("sticker")}
            className={cn("rounded-full px-3 py-1 text-xs font-medium transition", tab === "sticker" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/60")}
          >
            Figurinhas
          </button>
        )}
        {tab === "emoji" && (
          <div className="ml-auto flex items-center gap-0.5" role="tablist" aria-label="Categorias de emoji">
            {EMOJI_GROUPS.map((g, i) => (
              <button
                key={g.label}
                type="button"
                role="tab"
                aria-selected={group === i}
                aria-label={g.label}
                onClick={() => setGroup(i)}
                className={cn("grid h-8 w-8 place-items-center rounded-lg text-lg transition hover:bg-background", group === i && "bg-background shadow-sm")}
              >
                {g.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "emoji" ? (
        <div className="max-h-56 overflow-y-auto p-2">
          <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {EMOJI_GROUPS[group].label}
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-0.5">
            {EMOJI_GROUPS[group].items.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onEmoji(emoji)}
                className="grid h-10 place-items-center rounded-lg text-2xl leading-none transition hover:scale-110 hover:bg-muted active:scale-95"
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto p-2">
          {STICKERS.map((g) => (
            <div key={g.group} className="mb-2 last:mb-0">
              <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.group}</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1">
                {g.items.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onSticker?.(`::sticker::${emoji}`)}
                    className="grid h-14 place-items-center rounded-xl text-4xl leading-none transition hover:scale-110 hover:bg-muted active:scale-95"
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
    </div>
  );
}

type GroupProps = { groupKey?: string; mine?: boolean; name?: string; createdAt?: string; message?: { author?: string; createdAt?: string } };

/** Marca mensagens seguidas da mesma pessoa (até 5 min) para o balão "colar" no anterior. */
function withGrouping(children: ReactNode): ReactNode[] {
  const items = Children.toArray(children);
  const info = items.map((c) => {
    if (!isValidElement(c) || typeof c.type === "string") return null;
    const pr = (c as ReactElement<GroupProps>).props;
    const key = pr.groupKey ?? pr.message?.author ?? (pr.mine !== undefined ? (pr.mine ? "me" : (pr.name ?? "other")) : undefined);
    const at = pr.createdAt ?? pr.message?.createdAt;
    return key && at ? { key, t: new Date(at).getTime() } : null;
  });
  const close = (a: (typeof info)[number], b: (typeof info)[number]) =>
    !!a && !!b && a.key === b.key && Math.abs(b.t - a.t) < 5 * 60_000 && new Date(a.t).toDateString() === new Date(b.t).toDateString();
  return items.map((c, i) => {
    if (!info[i]) return c;
    return cloneElement(c as ReactElement<Record<string, unknown>>, {
      joinPrev: close(info[i - 1] ?? null, info[i]),
      joinNext: close(info[i], info[i + 1] ?? null),
    });
  });
}

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
  /** botões extras dentro do campo de mensagem (ex.: respostas rápidas) */
  toolbar?: ReactNode;
  /** painel opcional logo abaixo do cabeçalho (ex.: sinalizar risco) */
  panel?: ReactNode;
  /** aviso fixo de confidencialidade */
  notice?: string;
  /** conversa de atendimento: permite ver a cor escolhida pela outra pessoa */
  conversationId?: string;
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
    /** mostra apoio (188/192) se quem escreve usar palavras de risco */
    riskHelp?: boolean;
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
  toolbar,
  notice,
  conversationId,
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
  // cor da outra pessoa (atualiza sozinha)
  const themes = useQuery({
    queryKey: ["chat-themes", conversationId],
    queryFn: () => chatService.getThemes(conversationId!),
    enabled: !!conversationId,
    refetchInterval: 20_000,
    retry: false,
  });
  const myId = typeof window !== "undefined" ? window.localStorage.getItem("vidaplus:user_id") : null;
  const otherTheme = (() => {
    const map = themes.data ?? {};
    const entry = Object.entries(map).find(([uid]) => uid !== myId);
    return themeById(entry?.[1]);
  })();

  // se já escolhi uma cor no perfil e este aparelho ainda não tem, usa a do perfil
  useEffect(() => {
    const mine = Object.entries(themes.data ?? {}).find(([uid]) => uid === myId)?.[1];
    if (mine && themeById(mine) && !localStorage.getItem(THEME_KEY)) setThemeId(mine);
  }, [themes.data, myId]);

  const chooseTheme = (id: string) => {
    setThemeId(id);
    setShowThemes(false);
    void chatService.saveTheme(id).catch(() => {});
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  };

  const [atBottom, setAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);
  const firstScroll = useRef(true);

  const toBottom = (smooth = true) => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setHasNew(false);
  };

  useEffect(() => {
    // primeira carga ou já estava no fim: acompanha; senão avisa que chegou mensagem
    if (firstScroll.current) {
      firstScroll.current = false;
      toBottom(false);
    } else if (atBottom) toBottom();
    else setHasNew(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
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
        onScroll={(e) => {
          const el = e.currentTarget;
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          setAtBottom(near);
          if (near) setHasNew(false);
        }}
        className="chat-bg min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
        aria-live="polite"
      >
        <ChatThemeContext.Provider value={{ other: otherTheme }}>
          <div className="flex flex-col gap-3">{withGrouping(children)}</div>
        </ChatThemeContext.Provider>
      </div>

      {!atBottom && (
        <div className="pointer-events-none relative">
          <button
            type="button"
            onClick={() => toBottom()}
            aria-label="Ir para as mensagens mais novas"
            className="pop-in pointer-events-auto absolute -top-14 right-4 grid h-10 w-10 place-items-center rounded-full border bg-card shadow-lg transition hover:scale-105"
          >
            <ChevronDown className="h-5 w-5" />
            {hasNew && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-card" />}
          </button>
        </div>
      )}

      {/* Campo de envio */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) composer.onSubmit();
        }}
        className="border-t bg-card px-3 py-3 safe-bottom sm:px-4"
      >
        {composer.riskHelp && detectRisk(composer.value) && <RiskSupport />}
        {typing}
        {replyBar}
        {showStickers && (
          <Picker
            onEmoji={(emoji) =>
              composer.onChange({ target: { value: composer.value + emoji } } as ChangeEvent<HTMLTextAreaElement>)
            }
            onSticker={
              composer.onSticker
                ? (st) => {
                    composer.onSticker?.(st);
                    setShowStickers(false);
                  }
                : undefined
            }
          />
        )}
        <div className="flex items-end gap-2">
          <div className="flex min-w-0 flex-1 items-end gap-1 rounded-3xl border bg-background px-1.5 py-1 shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
            <button
              type="button"
              onClick={() => setShowStickers(!showStickers)}
              aria-label="Emojis e figurinhas"
              aria-expanded={showStickers}
              disabled={composer.disabled}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Smile className="h-5 w-5" />
            </button>
            {toolbar}
            <textarea
              id="chat-message"
              rows={1}
              value={composer.value}
              onChange={(e) => {
                composer.onChange(e);
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 128)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) composer.onSubmit();
                }
              }}
              placeholder={composer.placeholder ?? "Escreva uma mensagem…"}
              maxLength={composer.maxLength ?? 2000}
              disabled={composer.disabled}
              aria-label="Mensagem"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-[0.95rem] leading-snug outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
          </div>
          <Button
            type="submit"
            disabled={!canSend}
            size="icon"
            className="h-11 w-11 shrink-0 rounded-full shadow-md"
            aria-label="Enviar mensagem"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        {composer.hint && <p className="mt-2 text-xs text-muted-foreground">{composer.hint}</p>}
      </form>
    </section>
  );
}
