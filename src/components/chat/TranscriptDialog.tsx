import { useEffect, useRef, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Janela de leitura de conversa: abre por cima da tela, tem cabeçalho fixo e
 * a área das mensagens rola sozinha (tela cheia no celular).
 */
export function TranscriptDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  actions,
  scrollKey,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  /** botões extras no cabeçalho (ex.: prontuário) */
  actions?: ReactNode;
  /** muda quando chegam mensagens novas, para rolar até o fim */
  scrollKey?: number | string;
  children: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
    }, 50);
    return () => window.clearTimeout(t);
  }, [open, scrollKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85dvh] max-h-[85dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:rounded-none">
        <DialogHeader className="space-y-1 border-b bg-gradient-to-b from-primary/10 to-transparent px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="truncate text-base sm:text-lg">{title}</DialogTitle>
          {subtitle ? (
            <DialogDescription className="text-xs">{subtitle}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">Conversa</DialogDescription>
          )}
          {actions && <div className="flex flex-wrap items-center gap-2 pt-2">{actions}</div>}
        </DialogHeader>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
