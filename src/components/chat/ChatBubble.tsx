import type { ReactNode } from "react";
import { CornerUpLeft } from "lucide-react";
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

export interface ChatBubbleProps {
  /** mensagem da própria pessoa (alinhada à direita, em destaque) */
  mine: boolean;
  text: string;
  createdAt: string;
  /** nome exibido acima da mensagem de outras pessoas (grupos/histórico) */
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
  name,
  showAvatar,
  status,
  reply,
  onReply,
  onRetry,
  footer,
}: ChatBubbleProps) {
  return (
    <div className={cn("group flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine && showAvatar && (
        <span
          className="mb-5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
          aria-hidden="true"
        >
          {initialsOf(name)}
        </span>
      )}

      <div className={cn("flex min-w-0 max-w-[82%] flex-col", mine ? "items-end" : "items-start")}>
        {!mine && name && (
          <span className="mb-1 px-1 text-xs font-semibold text-foreground">{name}</span>
        )}

        <div
          className={cn(
            "relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
            mine
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md border bg-card text-card-foreground",
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
              "mt-1 flex items-center gap-1.5 text-[11px]",
              mine ? "justify-end text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            <time dateTime={createdAt}>{fmtTime(createdAt)}</time>
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
          className="mb-1 h-7 w-7 shrink-0 rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 max-md:opacity-60"
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

/** Aviso do sistema no meio da conversa. */
export function ChatNotice({ children }: { children: ReactNode }) {
  return <p className="my-1 text-center text-xs text-muted-foreground">{children}</p>;
}

/** Indicador "digitando…" padrão. */
export function TypingDots({ label }: { label: string }) {
  return (
    <div
      className="flex w-fit items-center gap-2 rounded-2xl border bg-card px-3 py-2 text-xs text-muted-foreground animate-in fade-in"
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
