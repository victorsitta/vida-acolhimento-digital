import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, FileBarChart, Printer, Smile, MessagesSquare, ShieldAlert, Clock } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { chatService, ratingService, reportService } from "@/services";
import { downloadCsv } from "@/lib/csv";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/admin/relatorios")({
  head: () => ({ meta: [{ title: "Relatório mensal — VIDA+" }] }),
  component: Page,
});

const same = (iso: string | undefined, y: number, m: number) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === y && d.getMonth() === m;
};
const pct = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? "novo" : "—") : `${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}%`);

function Page() {
  useAuthGuard();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const convs = useQuery({ queryKey: ["admin-conversations"], queryFn: chatService.getConversations, retry: false });
  const ratings = useQuery({ queryKey: ["ratings", "volunteers"], queryFn: ratingService.list, retry: false });
  const reports = useQuery({ queryKey: ["reports"], queryFn: reportService.list, retry: false });

  const prev = ym.m === 0 ? { y: ym.y - 1, m: 11 } : { y: ym.y, m: ym.m - 1 };
  const label = new Date(ym.y, ym.m, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const stats = useMemo(() => {
    const calc = (y: number, m: number) => {
      const c = (convs.data ?? []).filter((x) => !x.isTeamChat && same(x.startedAt, y, m));
      const ended = c.filter((x) => x.status === "ended");
      const rated = (ratings.data ?? []).filter((x) => same(x.createdAt, y, m));
      const rep = (reports.data ?? []).filter((x) => same(x.createdAt, y, m));
      const minutes = ended.reduce((s, x) => (x.endedAt ? s + Math.max(0, (new Date(x.endedAt).getTime() - new Date(x.startedAt).getTime()) / 60000) : s), 0);
      return {
        total: c.length,
        ended: ended.length,
        avgMin: ended.length ? Math.round(minutes / ended.length) : 0,
        avgRating: rated.length ? rated.reduce((s, x) => s + x.rating, 0) / rated.length : 0,
        rated: rated.length,
        reports: rep.length,
        resolved: rep.filter((x) => x.status === "resolvido").length,
        volunteers: new Set(c.map((x) => x.volunteerAlias).filter(Boolean)).size,
      };
    };
    return { cur: calc(ym.y, ym.m), prev: calc(prev.y, prev.m) };
  }, [convs.data, ratings.data, reports.data, ym, prev.y, prev.m]);

  const { cur, prev: p } = stats;
  const go = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };

  const exportCsv = () =>
    downloadCsv(
      `relatorio-${ym.y}-${String(ym.m + 1).padStart(2, "0")}`,
      ["Indicador", label, "Mês anterior"],
      [
        ["Atendimentos iniciados", cur.total, p.total],
        ["Atendimentos encerrados", cur.ended, p.ended],
        ["Duração média (min)", cur.avgMin, p.avgMin],
        ["Nota média", cur.avgRating.toFixed(2), p.avgRating.toFixed(2)],
        ["Avaliações recebidas", cur.rated, p.rated],
        ["Denúncias", cur.reports, p.reports],
        ["Denúncias resolvidas", cur.resolved, p.resolved],
        ["Voluntários que atenderam", cur.volunteers, p.volunteers],
      ],
    );

  return (
    <AppShell>
      <div className="print:hidden">
        <PageHeader
          title="Relatório mensal"
          description="Resumo do mês, comparado com o mês anterior."
          actions={
            <>
              <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button size="sm" className="gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Imprimir / PDF
              </Button>
            </>
          }
        />
      </div>

      <div className="mb-5 flex items-center justify-center gap-3 print:hidden">
        <Button variant="outline" size="icon" onClick={() => go(-1)} aria-label="Mês anterior">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="min-w-44 text-center font-display text-lg font-semibold capitalize">{label}</p>
        <Button variant="outline" size="icon" onClick={() => go(1)} aria-label="Próximo mês" disabled={ym.y === now.getFullYear() && ym.m >= now.getMonth()}>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="hidden print:block">
        <h1 className="font-display text-3xl font-semibold">VIDA+ · Relatório de {label}</h1>
        <p className="mb-6 text-sm">Gerado em {now.toLocaleDateString("pt-BR")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Atendimentos" icon={MessagesSquare} tone="primary" value={String(cur.total)} hint={`vs mês anterior: ${pct(cur.total, p.total)}`} />
        <StatCard label="Duração média" icon={Clock} tone="info" value={`${cur.avgMin} min`} hint={`vs mês anterior: ${pct(cur.avgMin, p.avgMin)}`} />
        <StatCard label="Nota média" icon={Smile} tone="success" value={cur.rated ? cur.avgRating.toFixed(1).replace(".", ",") : "—"} hint={`${cur.rated} avaliações`} />
        <StatCard label="Denúncias" icon={ShieldAlert} tone="accent" value={String(cur.reports)} hint={`${cur.resolved} resolvidas`} />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Indicador</th>
              <th className="px-4 py-3 capitalize">{label}</th>
              <th className="px-4 py-3">Mês anterior</th>
              <th className="px-4 py-3">Variação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[
              ["Atendimentos iniciados", cur.total, p.total],
              ["Atendimentos encerrados", cur.ended, p.ended],
              ["Voluntários que atenderam", cur.volunteers, p.volunteers],
              ["Avaliações recebidas", cur.rated, p.rated],
              ["Denúncias", cur.reports, p.reports],
              ["Denúncias resolvidas", cur.resolved, p.resolved],
            ].map(([k, a, b]) => (
              <tr key={String(k)}>
                <td className="px-4 py-3 font-medium">{k}</td>
                <td className="px-4 py-3 tabular-nums">{a}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{b}</td>
                <td className="px-4 py-3 tabular-nums">{pct(Number(a), Number(b))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground print:hidden">
        <FileBarChart className="h-4 w-4" /> Números calculados a partir dos registros do sistema no mês escolhido.
      </p>
    </AppShell>
  );
}
