import { LifeBuoy, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Faixa de apoio mostrada a quem escreve algo com sinal de risco. Não bloqueia o envio. */
export function RiskSupport() {
  return (
    <div role="alert" className="pop-in mb-2 flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
      <LifeBuoy className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-48 text-sm leading-snug">
        Parece que você está passando por algo muito difícil. <strong>Você não está sozinho(a).</strong> Se estiver em risco agora, fale com alguém neste instante.
      </p>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="destructive" className="gap-1.5">
          <a href="tel:188">
            <Phone className="h-3.5 w-3.5" /> 188 CVV
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <a href="tel:192">
            <Phone className="h-3.5 w-3.5" /> 192 SAMU
          </a>
        </Button>
      </div>
    </div>
  );
}
