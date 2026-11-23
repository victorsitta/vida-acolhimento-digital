import { useEffect, useRef, type ChangeEvent, type ReactNode } from "react";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
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
        <div className="flex items-end gap-2">
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
