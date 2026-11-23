import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/layouts/PublicLayout";
import { DataPolicy } from "@/components/common/DataPolicy";

export const Route = createFileRoute("/privacidade")({
  head: () => ({ meta: [{ title: "Política de privacidade — VIDA+" }] }),
  component: () => (
    <PublicLayout>
      <article className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Política de privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: novembro de 2026.</p>

        <p className="mt-6 text-pretty text-muted-foreground">
          Queremos ser claros: para cuidar de você com segurança, guardamos algumas informações por um
          tempo limitado. Abaixo está exatamente o que guardamos, quem pode ver e por quanto tempo.
        </p>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">O que guardamos e por quanto tempo</h2>
          <DataPolicy />
        </section>

        <section className="mt-10 space-y-5 text-sm text-muted-foreground text-pretty">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Por que guardamos</h2>
            <p className="mt-1">
              Para você poder reler suas conversas, para o voluntário dar continuidade ao cuidado, para
              proteger a comunidade (denúncias e sinais de risco) e para cumprir a lei. Não usamos suas
              conversas para publicidade.
            </p>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Quem pode ver suas conversas</h2>
            <p className="mt-1">
              Você e a pessoa que conversou com você. A moderação e a administração só leem uma conversa
              quando há denúncia, risco ou necessidade de apoio, e <strong className="text-foreground">cada acesso fica registrado</strong>{" "}
              em um log que a administração pode auditar.
            </p>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Alertas de segurança</h2>
            <p className="mt-1">
              Mensagens com sinais de risco para a vida (por exemplo, falar em se machucar) geram um aviso
              automático ao voluntário e à moderação, para que alguém possa ajudar. Esse aviso não é
              diagnóstico.
            </p>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Compartilhamento</h2>
            <p className="mt-1">
              Não vendemos nem compartilhamos dados com terceiros para marketing. Compartilhamos somente
              quando a lei exigir ou para proteger a vida de alguém em risco imediato.
            </p>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Seus direitos (LGPD)</h2>
            <p className="mt-1">
              Você pode, a qualquer momento: <strong className="text-foreground">baixar uma cópia</strong> dos seus dados,{" "}
              <strong className="text-foreground">corrigir</strong> o apelido e <strong className="text-foreground">excluir a sua conta</strong>.
              Tudo isso está em{" "}
              <Link to="/app/privacidade" className="text-primary hover:underline">
                Privacidade e LGPD
              </Link>
              , dentro do aplicativo. Ao excluir, seus dados pessoais são apagados e a conta deixa de
              funcionar.
            </p>
          </div>
        </section>
      </article>
    </PublicLayout>
  ),
});
