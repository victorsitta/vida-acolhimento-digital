import type { ReactNode } from "react";
import { CheckCheck, CornerUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/utils/format";

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
  { avatar: "bg-primary/20 text-primary ring-primary/40", name: "text-primary", edge: "border-l-primary" },
  { avatar: "bg-accent/20 text-accent ring-accent/40", name: "text-accent", edge: "border-l-accent" },
  { avatar: "bg-success/20 text-success ring-success/40", name: "text-success", edge: "border-l-success" },
  { avatar: "bg-info/20 text-info ring-info/40", name: "text-info", edge: "border-l-info" },
  { avatar: "bg-destructive/15 text-destructive ring-destructive/30", name: "text-destructive", edge: "border-l-destructive" },
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
    <div className="my-2 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="rounded-full border bg-card/90 px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
        {dayLabel(date)}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

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
}: ChatBubbleProps) {
  const tone = toneOf(name);
  const newDay = prevCreatedAt === undefined ? false : !sameDay(prevCreatedAt, createdAt);

  return (
    <>
      {newDay && <ChatDay date={createdAt} />}
      <div className={cn("pop-in group flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
        {!mine && showAvatar && (
          <span
            className={cn(
              "mb-5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ring-2",
              tone.avatar,
            )}
            aria-hidden="true"
          >
            {initialsOf(name)}
          </span>
        )}

        <div className={cn("flex min-w-0 max-w-[82%] flex-col", mine ? "items-end" : "items-start")}>
          {!mine && name && (
            <span className={cn("mb-1 px-1 text-xs font-semibold", tone.name)}>{name}</span>
          )}

          <div
            className={cn(
              "relative px-4 py-2.5 text-sm leading-relaxed",
              mine
                ? "rounded-2xl rounded-br-md bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-md shadow-primary/20"
                : cn("rounded-2xl rounded-bl-md border border-l-4 bg-card text-card-foreground shadow-sm", tone.edge),
            )}
          >
            {reply && (
              <div
                className={cn(
                  "mb-2 rounded-lg border-l-2 p-2 text-xs",
                  mine
                    ? "border-primary-foreground/50 bg-primary-foreground/10"
                    : "border-primary/60 bg-muted/60 text-muted-foreground",
                )}
              >
                <span className="block font-semibold">{reply.author}</span>
                <span className="line-clamp-2">{reply.text}</span>
              </div>
            )}
            <p className="whitespace-pre-wrap break-words text-pretty">{text}</p>
            <div
              className={cn(
                "mt-1 flex items-center justify-end gap-1 text-[11px]",
                mine ? "text-primary-foreground/75" : "text-muted-foreground",
              )}
            >
              <time dateTime={createdAt}>{fmtTime(createdAt)}</time>
              {mine && status !== "sending" && status !== "error" && (
                <CheckCheck className="h-3.5 w-3.5" aria-label="Enviada" />
              )}
              {status === "sending" && <span>· enviando…</span>}
              {status === "error" && (
                <button type="button" onClick={onRetry} className="underline">
                  Falhou — reenviar
                </button>
              )}
            </div>
          </div>

          {footer}
        </div>

        {onReply && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onReply}
            aria-label="Responder mensagem"
            className="mb-1 h-8 w-8 shrink-0 rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 max-md:opacity-60"
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
    <p className="mx-auto my-1 w-fit max-w-[90%] rounded-full bg-muted/70 px-3 py-1 text-center text-xs text-muted-foreground">
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
