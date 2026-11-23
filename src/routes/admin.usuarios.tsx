import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { userService } from "@/services";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ProfileRole } from "@/types";
import { Pager, usePagination } from "@/components/common/Pager";
import { FilterChips } from "@/components/common/FilterChips";
import { downloadCsv } from "@/lib/csv";
import { Download } from "lucide-react";
import { SearchInput } from "@/components/common/SearchInput";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — VIDA+" }] }),
  component: Page,
});

const ROLES: ProfileRole[] = ["usuario", "voluntario", "moderador", "administrador"];
const ROLE_LABEL: Record<ProfileRole, string> = {
  usuario: "Usuário",
  voluntario: "Voluntário",
  moderador: "Moderador",
  administrador: "Administrador",
};

function Page() {
  useAuthGuard();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["users"], queryFn: userService.list });
  const me = useQuery({ queryKey: ["me"], queryFn: () => userService.me() });
  const m = useMutation({
    mutationFn: ({ id, role }: { id: string; role: ProfileRole }) =>
      userService.updateRole(id, role),
    onSuccess: () => {
      toast.success("Papel atualizado.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível atualizar o papel."),
  });

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const banMutation = useMutation({
    mutationFn: ({ id, ban }: { id: string; ban: boolean }) => userService.ban(id, ban),
    onSuccess: (_, variables) => {
      toast.success(variables.ban ? "Usuário suspenso com sucesso." : "Usuário reativado.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: () => toast.error("Não foi possível alterar o status do usuário."),
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"todos" | ProfileRole | "suspensos">("todos");
  const all = q.data ?? [];
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return all.filter((u) => {
      if (roleFilter === "suspensos" ? u.status !== "banido" : roleFilter !== "todos" && u.role !== roleFilter) return false;
      return !t || u.name.toLowerCase().includes(t) || (u.email ?? "").toLowerCase().includes(t);
    });
  }, [all, search, roleFilter]);
  const countOf = (r: ProfileRole) => all.filter((u) => u.role === r).length;
  const pg = usePagination(filtered, 12);
  const userDetailsQuery = useQuery({
    queryKey: ["user-details", selectedUserId],
    queryFn: () => userService.getDetails(selectedUserId!),
    enabled: !!selectedUserId,
  });

  const roleSelect = (u: (typeof pg.pageItems)[number], full = false) => (
                  <Select
                    value={u.role}
                    disabled={u.id === me.data?.id || m.isPending}
                    onValueChange={(v) => {
                      if (
                        window.confirm(
                          `Alterar o papel de ${u.name} para ${ROLE_LABEL[v as ProfileRole]}?`,
                        )
                      )
                        m.mutate({ id: u.id, role: v as ProfileRole });
                    }}
                  >
                    <SelectTrigger
                      className={full ? "h-10 w-full" : "h-9 w-[160px]"}
                      title={u.id === me.data?.id ? "Você não pode alterar o próprio papel" : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
  );
  const actions = (u: (typeof pg.pageItems)[number]) => (
    <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedUserId(u.id)}
                  >
                    Detalhes
                  </Button>
                  <Button
                    variant={u.status === "banido" ? "secondary" : "destructive"}
                    size="sm"
                    onClick={() => {
                      if (window.confirm(`Deseja realmente ${u.status === "banido" ? "reativar" : "suspender"} este usuário?`)) {
                        banMutation.mutate({ id: u.id, ban: u.status !== "banido" });
                      }
                    }}
                    disabled={banMutation.isPending}
                  >
                    {u.status === "banido" ? "Reativar" : "Banir"}
                  </Button>
    </>
  );

  return (
    <AppShell>
      <PageHeader
        title="Usuários e papéis"
        description="Gerencie permissões. Confirme antes de aplicar ações críticas."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!filtered.length}
            onClick={() =>
              downloadCsv(
                "usuarios",
                ["Nome", "E-mail", "Papel", "Status", "Desde"],
                filtered.map((u) => [u.name, u.email, u.role, u.status, u.joinedAt]),
              )
            }
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        }
      />
      <div className="mb-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome ou e-mail" className="max-w-md" />
        <FilterChips
          label="Filtrar por papel"
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: "todos", label: "Todos", count: all.length },
            { value: "usuario", label: "Usuários", count: countOf("usuario") },
            { value: "voluntario", label: "Voluntários", count: countOf("voluntario") },
            { value: "moderador", label: "Moderadores", count: countOf("moderador") },
            { value: "administrador", label: "Admins", count: countOf("administrador") },
            { value: "suspensos", label: "Suspensos", count: all.filter((u) => u.status === "banido").length },
          ]}
        />
      </div>
      <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pg.pageItems.map((u) => (
          <li key={u.id} className="card-lift rounded-2xl border bg-card p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback>{u.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{u.name}</p>
                {u.email && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
              </div>
              {u.status === "banido" && (
                <span className="ml-auto shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                  Suspenso
                </span>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Papel</span>
              {roleSelect(u, true)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">{actions(u)}</div>
          </li>
        ))}
      </ul>
      <Pager {...pg} onPageChange={pg.setPage} />

      {/* Dialog para exibir detalhes do usuário (exclusivo admin) */}
      <Dialog open={!!selectedUserId} onOpenChange={(open) => { if (!open) setSelectedUserId(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Informações Administrativas do Usuário</DialogTitle>
            <DialogDescription>
              Dados detalhados e controle de acesso exclusivo de administração.
            </DialogDescription>
          </DialogHeader>
          {userDetailsQuery.isPending && (
            <p className="text-center py-4 text-sm text-muted-foreground">Carregando informações...</p>
          )}
          {userDetailsQuery.data && (
            <div className="space-y-4 py-2 text-sm">
              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">Nome de Exibição</p>
                  <p className="font-semibold text-foreground mt-0.5">{userDetailsQuery.data.name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">Apelido (Nickname)</p>
                  <p className="font-semibold text-foreground mt-0.5">{userDetailsQuery.data.profile?.nickname || "Não definido"}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">E-mail (Privado)</p>
                  <p className="font-medium text-foreground mt-0.5">{userDetailsQuery.data.email}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">Cargo / Permissão</p>
                  <p className="font-semibold text-primary mt-0.5 capitalize">{userDetailsQuery.data.role}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">Estado da Conta</p>
                  <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-medium mt-1 ${
                    userDetailsQuery.data.status === 'banido' ? 'bg-destructive/15 text-destructive' : 'bg-green-100 text-green-800'
                  }`}>
                    {userDetailsQuery.data.status === 'banido' ? 'Suspenso' : 'Ativo'}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">Localização / Estado</p>
                  <p className="font-semibold text-foreground mt-0.5 uppercase">{userDetailsQuery.data.profile?.state || "N/A"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b pb-3">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">Ano de Nascimento</p>
                  <p className="font-medium text-foreground mt-0.5">{userDetailsQuery.data.profile?.birth_year || "Não informado"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase">Criado em</p>
                  <p className="font-medium text-foreground mt-0.5">{new Date(userDetailsQuery.data.joinedAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedUserId(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
