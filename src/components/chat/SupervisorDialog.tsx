import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supervisorService } from "@/services/features";

/** Botão do voluntário para pedir ajuda da moderação durante um atendimento difícil. */
export function SupervisorButton({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [urgent, setUrgent] = useState(false);

  const send = useMutation({
    mutationFn: () => supervisorService.request(conversationId, note.trim() || undefined, urgent),
    onSuccess: () => {
      toast.success("Pedido enviado. A moderação foi avisada.");
      setOpen(false);
      setNote("");
      setUrgent(false);
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível pedir apoio."),
  });

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)} aria-label="Pedir apoio à moderação">
        <LifeBuoy className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline">Apoio</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pedir apoio à moderação</DialogTitle>
            <DialogDescription>Você não precisa atender sozinho(a). Conte rapidamente o que está difícil.</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: a pessoa fala em se machucar e não sei como conduzir…" maxLength={500} />
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-destructive/5 p-3">
            <span>
              <span className="block text-sm font-medium">É urgente</span>
              <span className="block text-xs text-muted-foreground">Risco imediato: a moderação é avisada com prioridade.</span>
            </span>
            <Switch checked={urgent} onCheckedChange={setUrgent} aria-label="Marcar como urgente" />
          </label>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant={urgent ? "destructive" : "default"} disabled={send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? "Enviando…" : "Pedir apoio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
