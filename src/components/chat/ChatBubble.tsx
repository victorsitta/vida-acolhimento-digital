import { useContext, type ReactNode } from "react";
import { CheckCheck, CornerUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/utils/format";
import { ChatThemeContext } from "@/components/chat/chatThemes";

function initialsOf(name?: string) {
  return (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Cada pessoa ganha sempre a mesma cor (pelo nome), para reconhecer quem fala. */
const TONES = [
  { avatar: "bg-primary/20 text-primary ring-primary/40", name: "text-primary" },
  { avatar: "bg-accent/20 text-accent ring-accent/40", name: "text-accent" },
  { avatar: "bg-success/20 text-success ring-success/40", name: "text-success" },
  { avatar: "bg-info/20 text-info ring-info/40", name: "text-info" },
  { avatar: "bg-destructive/15 text-destructive ring-destructive/30", name: "text-destructive" },
];
function toneOf(name?: string) {
  let h = 0;
  for (const c of name ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

const sameDay = (a?: string, b?: string) =>
  !!a && !!b && new Date(a).toDateString() === new Date(b).toDateString();

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Separador "Hoje / Ontem / 12 de março" entre mensagens de dias diferentes. */
export function ChatDay({ date }: { date: string }) {
  return (
    <div className="my-3 flex justify-center" role="separator">
      <span className="rounded-lg bg-card/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm ring-1 ring-border">
        {dayLabel(date)}
      </span>
    </div>
  );
}

/** Mensagem só de 1 a 3 emojis: aparece grande, como no WhatsApp. */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u;
export const isEmojiOnly = (text: string) => EMOJI_ONLY.test(text.trim());

/** Figurinha: mensagem enviada como "::sticker::🤗" (sem mudar o banco). */
export const STICKER_PREFIX = "::sticker::";
export const isSticker = (text: string) => text.startsWith(STICKER_PREFIX);
export const stickerOf = (text: string) => text.slice(STICKER_PREFIX.length);
/** Texto legível para prévias (listas, notificações). */
export const previewText = (text: string) => (isSticker(text) ? `${stickerOf(text)} figurinha` : text);

export interface ChatBubbleProps {
  /** mensagem da própria pessoa (alinhada à direita, em destaque) */
  mine: boolean;
  text: string;
  createdAt: string;
  /** data da mensagem anterior: se for de outro dia, mostra o separador */
  prevCreatedAt?: string;
  /** nome exibido acima da mensagem de outras pessoas */
  name?: string;
  /** mostra o avatar com iniciais ao lado (mensagens de outras pessoas) */
  showAvatar?: boolean;
  status?: "sending" | "sent" | "error";
  reply?: { author: string; text: string };
  onReply?: () => void;
  onRetry?: () => void;
  /** conteúdo extra abaixo da bolha (ex.: ações de moderação) */
  footer?: ReactNode;
  /** agrupamento (preenchido pelo ChatRoom): mesma pessoa em sequência */
  joinPrev?: boolean;
  joinNext?: boolean;
}

/** Balão de mensagem único para todos os chats (atendimento, grupos e históricos). */
export function ChatBubble({
  mine,
  text,
  createdAt,
  prevCreatedAt,
  name,
  showAvatar,
  status,
  reply,
  onReply,
  onRetry,
  footer,
  joinPrev,
  joinNext,
}: ChatBubbleProps) {
  const tone = toneOf(name);
  const { other } = useContext(ChatThemeContext);
  const otherColored = !mine && !!other?.from;
  const newDay = prevCreatedAt === undefined ? false : !sameDay(prevCreatedAt, createdAt);
  // se o dia mudou, o grupo recomeça
  const gPrev = joinPrev && !newDay;
  const sticker = isSticker(text);
  const big = isEmojiOnly(text);
  const onColor = mine || otherColored;

  const time = (
    <span
      className={cn(
        "ml-3 inline-flex translate-y-0.5 items-center gap-1 whitespace-nowrap align-bottom text-[11px] leading-none",
        onColor ? "opacity-80" : "text-muted-foreground",
      )}
    >
      <time dateTime={createdAt}>{fmtTime(createdAt)}</time>
      {mine && status !== "sending" && status !== "error" && (
        <CheckCheck className="h-3.5 w-3.5" aria-label="Enviada" />
      )}
      {status === "sending" && <span>enviando…</span>}
      {status === "error" && (
        <button type="button" onClick={onRetry} className="underline">
          reenviar
        </button>
      )}
    </span>
  );

  const bubbleStyle = otherColored
    ? { background: `linear-gradient(135deg, ${other!.from}, ${other!.to})`, color: other!.fg || "white" }
    : mine
      ? {
          background:
            "linear-gradient(135deg, var(--bubble-from, var(--primary)), var(--bubble-to, color-mix(in oklab, var(--primary) 82%, var(--accent))))",
          color: "var(--bubble-fg, var(--primary-foreground))",
        }
      : undefined;

  return (
    <>
      {newDay && <ChatDay date={createdAt} />}
      <div
        className={cn(
          "pop-in group flex items-end gap-2",
          mine ? "justify-end" : "justify-start",
          gPrev && "-mt-2",
        )}
      >
        {!mine && showAvatar && (
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ring-2",
              tone.avatar,
              joinNext && "invisible",
            )}
            aria-hidden="true"
          >
            {initialsOf(name)}
          </span>
        )}

        <div className={cn("flex min-w-0 max-w-[80%] flex-col sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
          {sticker ? (
            <div className="px-1 pb-1">
              <span
                className="block origin-bottom animate-in zoom-in-50 text-6xl leading-none drop-shadow-sm duration-300 sm:text-7xl"
                role="img"
                aria-label="Figurinha"
              >
                {stickerOf(text)}
              </span>
              <span className="mt-1 block text-right text-[11px] text-muted-foreground">{fmtTime(createdAt)}</span>
            </div>
          ) : (
            <div
              className={cn(
                "relative flow-root px-3 py-1.5 text-[0.92rem] leading-snug shadow-sm",
                !onColor && "border bg-card text-card-foreground",
                // cantos: o grupo "cola" as mensagens da mesma pessoa; o último ganha o rabinho
                mine
                  ? cn("rounded-2xl", gPrev && "rounded-tr-md", joinNext ? "rounded-br-md" : "rounded-br-sm")
                  : cn("rounded-2xl", gPrev && "rounded-tl-md", joinNext ? "rounded-bl-md" : "rounded-bl-sm"),
                !joinNext && (mine ? "chat-tail chat-tail-r" : "chat-tail chat-tail-l"),
              )}
              style={bubbleStyle}
            >
              {!mine && name && !gPrev && (
                <span className={cn("mb-0.5 block text-xs font-semibold", otherColored ? "opacity-90" : tone.name)}>
                  {name}
                </span>
              )}
              {reply && (
                <div
                  className={cn(
                    "mb-1.5 rounded-lg border-l-4 px-2 py-1 text-xs",
                    onColor ? "border-white/60 bg-black/10" : "border-primary/70 bg-muted/60 text-muted-foreground",
                  )}
                >
                  <span className="block font-semibold">{reply.author}</span>
                  <span className="line-clamp-2 opacity-90">{reply.text}</span>
                </div>
              )}
              <span
                className={cn(
                  "whitespace-pre-wrap break-words",
                  big && "block text-4xl leading-tight sm:text-5xl",
                )}
              >
                {text}
              </span>
              {time}
            </div>
          )}

          {footer}
        </div>

        {onReply && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onReply}
            aria-label="Responder mensagem"
            className="mb-0.5 h-8 w-8 shrink-0 rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 max-md:opacity-60"
          >
            <CornerUpLeft className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </>
  );
}

/** Aviso do sistema no meio da conversa. */
export function ChatNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto my-1 w-fit max-w-[90%] rounded-lg bg-amber-100/70 px-3 py-1 text-center text-xs text-amber-900 shadow-sm dark:bg-amber-950/40 dark:text-amber-100">
      {children}
    </p>
  );
}

/** Indicador "digitando…" padrão. */
export function TypingDots({ label }: { label: string }) {
  return (
    <div
      className="pop-in flex w-fit items-center gap-2 rounded-2xl border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm"
      role="status"
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
      </span>
      {label}
    </div>
  );
}
