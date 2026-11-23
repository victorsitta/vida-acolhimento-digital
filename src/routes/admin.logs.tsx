import { SearchInput } from "@/components/common/SearchInput";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, ScrollText, Search } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Pager, usePagination } from "@/components/common/Pager";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { auditService, type AuditLog } from "@/services";
import { logAudit } from "@/services/audit";
import { fmtDateTime, fmtRelative } from "@/utils/format";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/logs")({
  head: () => ({ meta: [{ title: "Logs e auditoria — VIDA+" }] }),
  component: Page,
});

const LABELS: Record<string, string> = {
  login: "Entrou no sistema",
  cadastro: "Criou conta",
  "senha.recuperacao": "Pediu recuperação de senha",
  "fila.entrada": "Entrou na fila de atendimento",
  "atendimento.aceito": "Aceitou um atendimento",
  "atendimento.encerrado": "Encerrou um atendimento",
  "atendimento.avaliado": "Avaliou um atendimento",
  "risco.sinalizado": "Sinalizou risco",
  "grupo.entrada": "Entrou em um grupo",
  "grupo.saida": "Saiu de um grupo",
  "grupo.criado": "Criou um grupo",
  "grupo.atualizado": "Alterou um grupo",
  "grupo.membro_atualizado": "Moderou participante de grupo",
  "grupo.mensagem_removida": "Removeu mensagem de grupo",
  "denuncia.criada": "Fez uma denúncia",
  "denuncia.atualizada": "Atualizou uma denúncia",
  "candidatura.enviada": "Enviou candidatura",
  "candidatura.aprovada": "Aprovou candidatura",
  "candidatura.recusada": "Recusou candidatura",
  "usuario.papel_alterado": "Alterou o papel de um usuário",
  "usuario.suspensao": "Suspendeu/reativou um usuário",
  "relatorio.enviado": "Enviou relatório de voluntário",
  "relatorio.respondido": "Respondeu relatório de voluntário",
  "prontuario.criado": "Registrou no prontuário",
  "prontuario.consultado": "Consultou um prontuário",
  "prontuario.anexo_aberto": "Abriu um anexo do prontuário",
  "atendimento.mensagem": "Enviou mensagem em atendimento",
  "atendimento.conversa_lida": "Leu uma conversa de atendimento",
  "grupo.mensagem": "Enviou mensagem em grupo",
  "grupo.conversa_lida": "Leu a conversa de um grupo",
  "login.anonimo": "Entrou como anônimo",
  logout: "Saiu do sistema",
  "cadastro.reenvio_confirmacao": "Pediu reenvio de confirmação",
  "disponibilidade.alterada": "Alterou a disponibilidade",
  "logs.exportado": "Exportou os logs",
  "conta.excluida": "Excluiu a própria conta",
  "moderacao.medida": "Aplicou uma medida de moderação",
  "moderacao.advertir": "Advertiu uma pessoa",
  "moderacao.suspender": "Suspendeu uma conta",
  "moderacao.reativar": "Reativou uma conta",
  "moderacao.remover_mensagem": "Removeu mensagem denunciada",
  "moderacao.denuncia_excluida": "Excluiu uma denúncia",
  "denuncia.avaliada": "Avaliou o atendimento da moderação",
  "conta.dados_exportados": "Baixou os próprios dados",
  "grupo.identidade_revelada": "Consultou identidade em grupo",
};

const CATEGORIES: Array<{ value: string; label: string; prefix: string[] }> = [
  { value: "todos", label: "Todas as categorias", prefix: [] },
  { value: "acesso", label: "Acesso e conta", prefix: ["login", "logout", "cadastro", "senha"] },
  { value: "atendimento", label: "Atendimentos, fila e prontuário", prefix: ["fila", "atendimento", "risco", "prontuario", "disponibilidade"] },
  { value: "grupos", label: "Grupos", prefix: ["grupo"] },
  { value: "moderacao", label: "Denúncias e moderação", prefix: ["denuncia", "relatorio", "moderacao"] },
  { value: "equipe", label: "Equipe e candidaturas", prefix: ["candidatura", "usuario", "logs", "conta"] },
];

function tone(action: string) {
  if (/(recusada|suspensao|removida|risco)/.test(action)) return "bg-destructive/15 text-destructive";
  if (/(aprovada|aceito|criado|criada)/.test(action)) return "bg-success/15 text-success";
  if (/(papel|atualizad|encerrado)/.test(action)) return "bg-warning/20 text-foreground";
  return "bg-muted text-muted-foreground";
}

const label = (a: string) => LABELS[a] ?? a.replace(/[._]/g, " ");

function csvCell(v: unknown) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function exportCsv(rows: AuditLog[]) {
  void logAudit("logs.exportado", "logs", null, { linhas: rows.length });
  const head = ["Data", "Quem", "Papel", "Ação", "Entidade", "ID da entidade", "Detalhes"];
  const lines = rows.map((l) =>
    [
      fmtDateTime(l.createdAt),
      l.actorName ?? "Sistema",
      l.actorRole ?? "",
      label(l.action),
      l.entityType,
      l.entityId ?? "",
      JSON.stringify(l.metadata),
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(["﻿" + [head.map(csvCell).join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `logs-vida-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Page() {
  useAuthGuard();
  const q = useQuery({ queryKey: ["audit-logs"], queryFn: auditService.list, refetchInterval: 15000 });
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("todos");
  const [period, setPeriod] = useState("7");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const cat = CATEGORIES.find((c) => c.value === category)!;
    const since = period === "todos" ? 0 : Date.now() - Number(period) * 86400_000;
    return (q.data ?? []).filter((l) => {
      if (new Date(l.createdAt).getTime() < since) return false;
      if (cat.prefix.length && !cat.prefix.some((p) => l.action.startsWith(p))) return false;
      if (!t) return true;
      return (
        label(l.action).toLowerCase().includes(t) ||
        (l.actorName ?? "").toLowerCase().includes(t) ||
        l.entityType.toLowerCase().includes(t) ||
        JSON.stringify(l.metadata).toLowerCase().includes(t)
      );
    });
  }, [q.data, term, category, period]);

  const pg = usePagination(rows, 15);
  const all = q.data ?? [];
  const today = all.filter((l) => new Date(l.createdAt).toDateString() === new Date().toDateString());

  return (
    <AppShell>
      <PageHeader
        title="Logs e auditoria"
        description="Registro de tudo o que acontece na plataforma: quem fez, o quê e quando."
        actions={
          <>
            <Button variant="outline" className="gap-2" onClick={() => q.refetch()}>
              <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} /> Atualizar
            </Button>
            <Button className="gap-2" disabled={!rows.length} onClick={() => exportCsv(rows)}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Registros" value={String(all.length)} icon={ScrollText} tone="primary" />
        <StatCard label="Hoje" value={String(today.length)} icon={ScrollText} tone="success" />
        <StatCard
          label="Atores únicos"
          value={String(new Set(all.map((l) => l.actorId).filter(Boolean)).size)}
          icon={ScrollText}
          tone="info"
        />
        <StatCard label="No filtro" value={String(rows.length)} icon={Search} tone="accent" />
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_160px]">
        <SearchInput value={term} onChange={setTerm} placeholder="Buscar por pessoa, ação ou detalhe" className="w-full" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-label="Categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Últimas 24h</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="todos">Todo o período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isPending ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : q.isError ? (
        <EmptyState
          icon={ScrollText}
          title="Não foi possível carregar os logs"
          description="Verifique se o SQL de auditoria foi executado no Supabase e se você está logado como administrador."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nenhum registro encontrado"
          description="Ajuste os filtros ou aguarde novas atividades na plataforma."
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
          {pg.pageItems.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setSelected(l)}
                className="row-hover flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left"
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                    tone(l.action),
                  )}
                >
                  {l.entityType}
                </span>
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block truncate text-sm font-medium">{label(l.action)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {l.actorName ?? "Sistema"}
                    {l.actorRole ? ` · ${l.actorRole}` : ""}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground" title={fmtDateTime(l.createdAt)}>
                  {fmtRelative(l.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pager {...pg} onPageChange={pg.setPage} />

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected ? label(selected.action) : ""}</DialogTitle>
            <DialogDescription>
              {selected ? fmtDateTime(selected.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Quem</dt>
              <dd>
                {selected.actorName ?? "Sistema"}
                {selected.actorRole ? ` (${selected.actorRole})` : ""}
              </dd>
              <dt className="text-muted-foreground">Código da ação</dt>
              <dd className="font-mono text-xs">{selected.action}</dd>
              <dt className="text-muted-foreground">Entidade</dt>
              <dd>{selected.entityType}</dd>
              <dt className="text-muted-foreground">ID</dt>
              <dd className="break-all font-mono text-xs">{selected.entityId ?? "—"}</dd>
              <dt className="text-muted-foreground">Detalhes</dt>
              <dd>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-xs">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </dd>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
