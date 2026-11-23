import { createFileRoute } from "@tanstack/react-router";
import { Brain, HeartPulse, Moon, Music, PenLine, Sprout } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { HeroBanner } from "@/components/common/HeroBanner";
import { MoodCheckin } from "@/components/wellbeing/MoodCheckin";
import { BreathingExercise } from "@/components/wellbeing/BreathingExercise";
import { TracksPanel } from "@/components/wellbeing/TracksPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/app/bem-estar")({
  head: () => ({ meta: [{ title: "Bem-estar — VIDA+" }] }),
  component: Page,
});

const TECHNIQUES = [
  {
    icon: Brain,
    title: "5-4-3-2-1: volte ao presente",
    steps: ["Veja 5 coisas ao redor", "Toque em 4 coisas", "Escute 3 sons", "Sinta 2 cheiros", "Perceba 1 gosto"],
    tone: "bg-info/15 text-info",
  },
  {
    icon: Moon,
    title: "Para dormir melhor",
    steps: ["Desligue as telas 30 min antes", "Escreva o que está na cabeça", "Faça a respiração 4-7-8", "Quarto escuro e fresco"],
    tone: "bg-primary/15 text-primary",
  },
  {
    icon: PenLine,
    title: "Descarregar a mente",
    steps: ["Escreva por 5 minutos sem parar", "Não releia nem corrija", "Separe o que depende de você", "Escolha um único próximo passo"],
    tone: "bg-accent/15 text-accent",
  },
  {
    icon: Sprout,
    title: "Pequenos passos do dia",
    steps: ["Beba um copo de água", "Caminhe 10 minutos", "Fale com alguém querido", "Faça algo que você gosta"],
    tone: "bg-success/15 text-success",
  },
  {
    icon: Music,
    title: "Relaxar o corpo",
    steps: ["Solte os ombros e a mandíbula", "Aperte e solte as mãos", "Alongue o pescoço devagar", "Ouça uma música calma"],
    tone: "bg-info/15 text-info",
  },
];

function Page() {
  useAuthGuard();
  return (
    <AppShell>
      <HeroBanner
        icon={HeartPulse}
        eyebrow="Cuide de você"
        title="Seu espaço de bem-estar"
        description="Registre como você está, respire com calma, siga uma trilha de 7 dias e use técnicas simples nos dias mais pesados."
      />

      <Tabs defaultValue="hoje">
        <TabsList className="mb-5 h-auto flex-wrap">
          <TabsTrigger value="hoje">Hoje</TabsTrigger>
          <TabsTrigger value="trilhas">Trilhas de 7 dias</TabsTrigger>
          <TabsTrigger value="tecnicas">Técnicas rápidas</TabsTrigger>
        </TabsList>

        <TabsContent value="hoje">
          <div className="grid gap-4 lg:grid-cols-2">
            <MoodCheckin />
            <BreathingExercise />
          </div>
        </TabsContent>

        <TabsContent value="trilhas">
          <TracksPanel />
        </TabsContent>

        <TabsContent value="tecnicas">
          <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {TECHNIQUES.map((t) => (
              <li key={t.title} className="card-lift rounded-xl border bg-card p-4 shadow-soft">
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${t.tone}`}>
                  <t.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{t.title}</h3>
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {t.steps.map((st, i) => (
                    <li key={st} className="flex gap-2">
                      <span className="font-semibold text-primary">{i + 1}.</span> {st}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Estas dicas apoiam o seu dia a dia, mas não substituem acompanhamento profissional.
          </p>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
