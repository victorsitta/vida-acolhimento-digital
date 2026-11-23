import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/layouts/PublicLayout";

export const Route = createFileRoute("/termos")({
  head: () => ({ meta: [{ title: "Termos de uso — VIDA+" }] }),
  component: () => (
    <PublicLayout>
      <article className="prose mx-auto max-w-3xl px-4 py-12 prose-headings:font-display prose-headings:tracking-tight">
        <h1 className="font-display text-4xl font-semibold">Termos de uso</h1>
        <p className="text-muted-foreground">Última atualização: junho de 2026.</p>
        <h2 className="mt-8 text-xl font-semibold">1. Finalidade</h2>
        <p className="text-sm text-muted-foreground">
          O VIDA+ oferece acolhimento e escuta emocional, sem caráter médico ou diagnóstico.
        </p>
        <h2 className="mt-6 text-xl font-semibold">2. Conduta</h2>
        <p className="text-sm text-muted-foreground">
          É vedado uso para fins ilícitos, discurso de ódio, assédio, exploração ou divulgação de
          dados pessoais alheios.
        </p>
        <h2 className="mt-6 text-xl font-semibold">3. Limitações</h2>
        <p className="text-sm text-muted-foreground">
          Voluntários não são profissionais de saúde. Em emergências, procure os serviços
          competentes.
        </p>
        <h2 className="mt-6 text-xl font-semibold">4. Registro do atendimento (prontuário)</h2>
        <p className="text-sm text-muted-foreground">
          Ao final de um atendimento, o voluntário pode registrar anotações em um prontuário
          confidencial, visível somente à equipe de atendimento, para dar continuidade ao cuidado.
          Você pode pedir acesso a esse registro.
        </p>
        <h2 className="mt-6 text-xl font-semibold">5. Segurança e alertas</h2>
        <p className="text-sm text-muted-foreground">
          Mensagens com sinais de risco à vida geram um aviso automático ao voluntário e à
          moderação, para que alguém possa ajudar. Em situações de risco imediato, podemos
          compartilhar o mínimo necessário com os serviços de emergência.
        </p>
        <h2 className="mt-6 text-xl font-semibold">6. Dados e privacidade</h2>
        <p className="text-sm text-muted-foreground">
          O que guardamos, quem pode ver e por quanto tempo está descrito na Política de
          privacidade. Você pode baixar seus dados e excluir a conta a qualquer momento.
        </p>
        <h2 className="mt-6 text-xl font-semibold">7. Encerramento</h2>
        <p className="text-sm text-muted-foreground">
          Sua conta pode ser suspensa em caso de violação destes termos.
        </p>
      </article>
    </PublicLayout>
  ),
});
