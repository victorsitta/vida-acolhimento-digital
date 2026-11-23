import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LifeBuoy, MessageCircleHeart, Phone, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GROUNDING = [
  "5 coisas que você vê",
  "4 coisas que você pode tocar",
  "3 sons que você ouve",
  "2 cheiros que você sente",
  "1 gosto na boca",
];

/** Botão SOS sempre à mão: ligações de emergência, conversa e técnica rápida para se acalmar. */
export function SosButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Preciso de ajuda agora (SOS)"
        data-tip="Preciso de ajuda agora (SOS)"
        className="grid h-11 w-11 place-items-center rounded-md text-destructive transition hover:bg-destructive/10"
      >
        <LifeBuoy className="h-5 w-5" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-destructive" /> Você não está sozinho(a)
            </DialogTitle>
            <DialogDescription>Respire. Vamos por partes. Escolha o que ajuda agora.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-semibold">Se há risco para a sua vida agora</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button asChild variant="destructive" className="h-auto flex-col gap-0.5 py-3">
                  <a href="tel:188">
                    <span className="flex items-center gap-1.5 text-lg font-bold"><Phone className="h-4 w-4" /> 188</span>
                    <span className="text-[11px] font-normal opacity-90">CVV · 24 horas</span>
                  </a>
                </Button>
                <Button asChild variant="destructive" className="h-auto flex-col gap-0.5 py-3">
                  <a href="tel:192">
                    <span className="flex items-center gap-1.5 text-lg font-bold"><Phone className="h-4 w-4" /> 192</span>
                    <span className="text-[11px] font-normal opacity-90">SAMU · emergência</span>
                  </a>
                </Button>
              </div>
            </div>

            <Button asChild size="lg" className="w-full gap-2" onClick={() => setOpen(false)}>
              <Link to="/app/conversar">
                <MessageCircleHeart className="h-4 w-4" /> Falar com um voluntário agora
              </Link>
            </Button>

            <div className="rounded-xl border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Wind className="h-4 w-4 text-primary" /> Técnica 5-4-3-2-1 (voltar ao presente)
              </p>
              <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                {GROUNDING.map((g) => (
                  <li key={g} className="flex gap-2">
                    <span className="text-primary">•</span> {g}
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm" onClick={() => setOpen(false)}>
                  <Link to="/app/bem-estar">Respiração guiada</Link>
                </Button>
                <Button asChild variant="outline" size="sm" onClick={() => setOpen(false)}>
                  <Link to="/app/plano-seguranca">Meu plano de segurança</Link>
                </Button>
                <Button asChild variant="outline" size="sm" onClick={() => setOpen(false)}>
                  <Link to="/app/ajuda">Onde buscar ajuda</Link>
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
