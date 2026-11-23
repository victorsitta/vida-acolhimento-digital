import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pager, usePagination } from "@/components/common/Pager";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { moderatorApplicationService } from "@/services";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/admin/moderadores/")({ component: Page });
function Page() {
  useAuthGuard();
  const query = useQuery({
    queryKey: ["moderator-applications"],
    queryFn: moderatorApplicationService.list,
  });
  const pg = usePagination(query.data ?? [], 8);
  return (
    <AppShell>
      <PageHeader
        title="Candidaturas a moderador"
        description="Aprovação exclusiva do administrador."
      />
      <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
        {pg.pageItems.map((item) => (
          <Link
            key={item.id}
            to="/admin/moderadores/$id"
            params={{ id: item.id }}
            className="flex items-center justify-between p-4 row-hover"
          >
            <div>
              <p className="font-medium">{item.candidateAlias}</p>
              <p className="text-xs text-muted-foreground">{item.motivation}</p>
            </div>
            <StatusBadge status={item.status} />
          </Link>
        ))}
        {!query.isPending && !query.data?.length && (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma candidatura.</p>
        )}
      </div>
      <Pager {...pg} onPageChange={pg.setPage} />
    </AppShell>
  );
}
