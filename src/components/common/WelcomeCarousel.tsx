import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Illustration } from "@/components/common/Illustration";
import { useProfile } from "@/contexts/ProfileContext";
import type { ProfileRole } from "@/types";
import { cn } from "@/lib/utils";

type Slide = { kind: "chat" | "calm" | "search" | "lost" | "oops"; title: string; text: string };

const SLIDES: Record<ProfileRole, Slide[]> = {
  usuario: [
    { kind: "calm", title: "Bem-vindo(a) ao VIDA+", text: "Um espaço seguro para ser ouvido(a), sem julgamentos e no seu ritmo." },
    { kind: "chat", title: "Converse quando quiser", text: "Fale com um voluntário agora, agende um horário ou participe de grupos de apoio com um apelido." },
    { kind: "search", title: "Cuide de você todo dia", text: "Check-in de humor, respiração guiada, trilhas de 7 dias e o seu plano de segurança. O botão SOS está sempre à mão." },
  ],
  voluntario: [
    { kind: "calm", title: "Obrigado por cuidar", text: "Você faz diferença na vida de quem está passando por um momento difícil." },
    { kind: "chat", title: "Atenda com apoio", text: "Fique online, aceite pessoas na fila e use as respostas rápidas. Se precisar, peça apoio à moderação." },
    { kind: "search", title: "Registre e evolua", text: "Faça o prontuário ao final de cada atendimento e acompanhe seu impacto e suas avaliações." },
  ],
  moderador: [
    { kind: "calm", title: "Você cuida da comunidade", text: "A moderação mantém os grupos seguros e acolhedores para todos." },
    { kind: "search", title: "Ferramentas de moderação", text: "Resolva denúncias com medidas (advertir, suspender, remover), leia conversas e atenda pedidos de apoio dos voluntários." },
  ],
  administrador: [
    { kind: "calm", title: "Painel de administração", text: "Visão geral da plataforma, candidaturas, usuários, grupos e relatórios." },
    { kind: "search", title: "Segurança e transparência", text: "Acompanhe os logs de auditoria, a retenção de dados e o relatório mensal para decidir com segurança." },
  ],
};

/** Boas-vindas no primeiro acesso de cada papel: 2 a 3 telas rápidas. */
export function WelcomeCarousel() {
  const { role } = useProfile();
  const key = `vida:welcome:${role}`;
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) setOpen(true);
    } catch {
      /* ok */
    }
  }, [key]);

  const slides = SLIDES[role] ?? SLIDES.usuario;
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ok */
    }
  };
  if (!open) return null;

  const s = slides[i];
  const last = i === slides.length - 1;
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="pop-in relative w-full max-w-md overflow-hidden rounded-xl border bg-card p-4 text-center shadow-2xl sm:p-8">
        <button type="button" onClick={close} aria-label="Pular" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
        <Illustration kind={s.kind} className="mx-auto h-40" />
        <h2 id="welcome-title" className="mt-2 font-display text-lg font-semibold text-balance">
          {s.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">{s.text}</p>

        <div className="mt-5 flex justify-center gap-1.5" aria-hidden="true">
          {slides.map((_, j) => (
            <span key={j} className={cn("h-1.5 rounded-full transition-all", j === i ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30")} />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>
          <Button onClick={() => (last ? close() : setI(i + 1))} className="gap-1.5">
            {last ? "Começar" : "Próximo"} {!last && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
