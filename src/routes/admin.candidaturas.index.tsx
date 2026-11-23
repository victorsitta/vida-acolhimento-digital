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
  const pg = usePagination(list, 8);
  const loading = vol.isPending || mod.isPending;

  return (
    <AppShell>
      <PageHeader
        title="Candidaturas"
        description={
          pending
            ? `${pending} aguardando sua decisão. Usuários que querem ser voluntários e voluntários que querem ser moderadores.`
            : "Usuários que querem ser voluntários e voluntários que querem ser moderadores."
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_180px]">
        <Input
          placeholder="Buscar candidato..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar candidato"
        />
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger aria-label="Tipo de candidatura">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="voluntario">Usuário → Voluntário</SelectItem>
            <SelectItem value="moderador">Voluntário → Moderador</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as ApplicationStatus | "todos")}
        >
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="aprovado">Aprovado</SelectItem>
            <SelectItem value="recusado">Recusado</SelectItem>
          </SelectContent>
        </Select>
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
            <li key={`${application.kind}-${application.id}`}>
              <Link
                to={
                  application.kind === "moderador"
                    ? "/admin/moderadores/$id"
                    : "/admin/candidaturas/$id"
                }
                params={{ id: application.id }}
                className="row-hover flex flex-wrap items-center gap-3 px-4 py-4"
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
