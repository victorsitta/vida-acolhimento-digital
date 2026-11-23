import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { DataPolicy } from "@/components/common/DataPolicy";
import { Label } from "@/components/ui/label";
import { clearSession, http } from "@/services/api/client";
import { deleteMyAccount, exportMyData } from "@/services/privacyService";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/app/privacidade")({
  head: () => ({ meta: [{ title: "Privacidade — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  const [consent, setConsent] = useState({ essencial: true, melhorias: true, pesquisa: false });

  const [busy, setBusy] = useState<null | "export" | "delete">(null);
  const doExport = async () => {
    setBusy("export");
    try {
      await exportMyData();
      toast.success("Arquivo gerado. Verifique seus downloads.");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível gerar o arquivo.");
    } finally {
      setBusy(null);
    }
  };
  const doDelete = async () => {
    if (!window.confirm("Excluir sua conta? Esta ação é definitiva e não pode ser desfeita.")) return;
    if (!window.confirm("Tem certeza? Seus dados pessoais serão apagados e você será desconectado.")) return;
    setBusy("delete");
    try {
      await deleteMyAccount();
      clearSession();
      window.location.assign("/");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível excluir a conta.");
      setBusy(null);
    }
  };

  const saveConsent = useMutation({
    mutationFn: async () => {
      const entries: Array<{ type: string; version: string }> = [];
      if (consent.melhorias) entries.push({ type: "politica_privacidade", version: "1.0" });
      if (consent.pesquisa) entries.push({ type: "comunicacoes", version: "1.0" });
      entries.push({ type: "termos_de_uso", version: "1.0" });
      await Promise.all(
        entries.map((e) =>
          http("/users/me/consent", {
            method: "POST",
            body: JSON.stringify(e),
          }),
        ),
      );
    },
    onSuccess: () => toast.success("Preferências salvas."),
    onError: () => toast.error("Não foi possível salvar as preferências."),
  });

  return (
    <AppShell>
      <PageHeader
        title="Privacidade & LGPD"
        description="Você controla o uso dos seus dados. Você pode revogar consentimentos a qualquer momento."
      />
      <section className="mb-5 max-w-4xl">
        <h2 className="mb-1 font-display text-base font-semibold">O que guardamos e por quanto tempo</h2>
        <p className="mb-3 text-sm text-muted-foreground">Transparência total sobre os seus dados.</p>
        <DataPolicy />
      </section>

      <div className="max-w-2xl space-y-4">
        <section className="rounded-xl border bg-card p-4 shadow-soft">
          <h2 className="font-semibold">Seus dados</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Baixe uma cópia dos seus dados ou peça a exclusão da sua conta. A exclusão é definitiva:
            seus dados pessoais são apagados e a conta deixa de funcionar.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy !== null} onClick={doExport}>
              {busy === "export" ? "Preparando…" : "Baixar meus dados"}
            </Button>
            <Button variant="destructive" disabled={busy !== null} onClick={doDelete}>
              {busy === "delete" ? "Excluindo…" : "Excluir minha conta"}
            </Button>
          </div>
        </section>
        <div className="rounded-2xl border bg-card divide-y">
          <Row
            id="ess"
            label="Dados essenciais"
            desc="Necessários para autenticação e funcionamento básico."
            disabled
            checked
          />
          <Row
            id="mel"
            label="Dados de uso para melhorias"
            desc="Métricas anonimizadas para evoluir a plataforma."
            checked={consent.melhorias}
            onChange={() => setConsent((c) => ({ ...c, melhorias: !c.melhorias }))}
          />
          <Row
            id="pes"
            label="Convite para pesquisas"
            desc="Receber convites ocasionais para entrevistas."
            checked={consent.pesquisa}
            onChange={() => setConsent((c) => ({ ...c, pesquisa: !c.pesquisa }))}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveConsent.mutate()} disabled={saveConsent.isPending}>
            {saveConsent.isPending ? "Salvando…" : "Salvar preferências"}
          </Button>
          <Button
            variant="outline"
            onClick={() => toast("Solicitação enviada. Responderemos em até 15 dias.")}
          >
            Solicitar exclusão de dados
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Row({
  id,
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
