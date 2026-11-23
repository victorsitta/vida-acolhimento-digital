import { SearchInput } from "@/components/common/SearchInput";
import { FilterChips } from "@/components/common/FilterChips";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, CheckCheck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, ClipboardList } from "lucide-react";
import { Pager, usePagination } from "@/components/common/Pager";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applicationService, moderatorApplicationService } from "@/services";
import { fmtRelative } from "@/utils/format";
import type { Application, ApplicationStatus } from "@/types";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/candidaturas/")({
  head: () => ({ meta: [{ title: "Candidaturas — VIDA+" }] }),
  component: Page,
});

const ROLE_LABEL: Record<string, string> = {
  cadastrado: "Usuário",
  usuario: "Usuário",
  anonimo: "Anônimo",
  voluntario: "Voluntário",
  moderador: "Moderador",
  administrador: "Administrador",
};

export function ApplicationKindBadge({ app }: { app: Pick<Application, "kind" | "currentRole"> }) {
  const toMod = app.kind === "moderador";
  const from = toMod ? "Voluntário" : "Usuário";
  const to = toMod ? "Moderador" : "Voluntário";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        toMod
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-primary/40 bg-primary/10 text-primary",
      )}
      title={app.currentRole ? `Papel atual: ${ROLE_LABEL[app.currentRole] ?? app.currentRole}` : undefined}
    >
      {from} <ArrowRight className="h-3 w-3" aria-hidden="true" /> {to}
    </span>
  );
}

function Page() {
  useAuthGuard();
  const vol = useQuery({ queryKey: ["applications"], queryFn: applicationService.list });
  const mod = useQuery({
    queryKey: ["moderator-applications"],
    queryFn: moderatorApplicationService.list,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "todos">("todos");
  const [kind, setKind] = useState<"todos" | "voluntario" | "moderador">("todos");

  const all = useMemo(
    () =>
      [...(vol.data ?? []), ...(mod.data ?? [])].sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      ),
    [vol.data, mod.data],
  );

  const list = useMemo(
    () =>
      all.filter((a) => {
        if (kind !== "todos" && a.kind !== kind) return false;
        if (status !== "todos" && a.status !== status) return false;
        if (search && !a.candidateAlias.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [all, search, status, kind],
  );

  const pending = all.filter((a) => a.status === "pendente").length;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const bulk = useMutation({
    mutationFn: async () => {
      const chosen = all.filter((a) => selected.includes(`${a.kind}-${a.id}`) && a.status === "pendente");
      await Promise.all(
        chosen.map((a) =>
          a.kind === "moderador"
            ? moderatorApplicationService.setStatus(a.id, true)
            : applicationService.setStatus(a.id, "aprovado"),
        ),
      );
      return chosen.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} candidatura${n > 1 ? "s" : ""} aprovada${n > 1 ? "s" : ""}.`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["moderator-applications"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível aprovar todas."),
  });
  const toggle = (k: string) => setSelected((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const pg = usePagination(list, 8);
  const loading = vol.isPending || mod.isPending;

  return (
    <AppShell>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {selected.length > 0 && (
              <Button size="sm" className="gap-2" disabled={bulk.isPending} onClick={() => bulk.mutate()}>
                <CheckCheck className="h-4 w-4" /> Aprovar {selected.length} selecionada{selected.length > 1 ? "s" : ""}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={!list.length}
              onClick={() =>
                downloadCsv(
                  "candidaturas",
                  ["Candidato", "Tipo", "Status", "Enviada em"],
                  list.map((a) => [a.candidateAlias, a.kind === "moderador" ? "Voluntário → Moderador" : "Usuário → Voluntário", a.status, a.submittedAt]),
                )
              }
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>
        }
        title="Candidaturas"
        description={
          pending
            ? `${pending} aguardando sua decisão. Usuários que querem ser voluntários e voluntários que querem ser moderadores.`
            : "Usuários que querem ser voluntários e voluntários que querem ser moderadores."
        }
      />
      <div className="mb-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar candidato…" className="max-w-md" />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <FilterChips
            label="Tipo de candidatura"
            value={kind}
            onChange={setKind}
            options={[
              { value: "todos", label: "Todos os tipos" },
              { value: "voluntario", label: "Usuário → Voluntário", count: all.filter((a) => a.kind !== "moderador").length },
              { value: "moderador", label: "Voluntário → Moderador", count: all.filter((a) => a.kind === "moderador").length },
            ]}
          />
          <FilterChips
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "todos", label: "Todos" },
              { value: "pendente", label: "Pendentes", count: all.filter((a) => a.status === "pendente").length },
              { value: "aprovado", label: "Aprovadas", count: all.filter((a) => a.status === "aprovado").length },
              { value: "recusado", label: "Recusadas", count: all.filter((a) => a.status === "recusado").length },
            ]}
          />
        </div>
      </div>

      {!loading && list.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma candidatura"
          description="Quando alguém se candidatar, aparece aqui para você aprovar ou recusar."
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
          {pg.pageItems.map((application) => (
            <li key={`${application.kind}-${application.id}`} className="flex items-center">
              {application.status === "pendente" ? (
                <span className="pl-4" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.includes(`${application.kind}-${application.id}`)}
                    onCheckedChange={() => toggle(`${application.kind}-${application.id}`)}
                    aria-label={`Selecionar ${application.candidateAlias}`}
                  />
                </span>
              ) : (
                <span className="w-8" aria-hidden="true" />
              )}
              <Link
                to={
                  application.kind === "moderador"
                    ? "/admin/moderadores/$id"
                    : "/admin/candidaturas/$id"
                }
                params={{ id: application.id }}
                className="row-hover flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-4"
              >
                <div className="min-w-0 flex-1 basis-52">
                  <p className="truncate text-sm font-medium">{application.candidateAlias}</p>
                  <p className="text-xs text-muted-foreground">
                    Enviada {fmtRelative(application.submittedAt)}
                    {application.currentRole
                      ? ` · hoje é ${ROLE_LABEL[application.currentRole] ?? application.currentRole}`
                      : ""}
                  </p>
                </div>
                <ApplicationKindBadge app={application} />
                <StatusBadge status={application.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager {...pg} onPageChange={pg.setPage} />
    </AppShell>
  );
}
