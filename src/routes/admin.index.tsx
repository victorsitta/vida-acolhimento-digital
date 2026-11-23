import { HeroBanner } from "@/components/common/HeroBanner";
import { ShieldCheck as HeroIcon } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/layouts/AppShell";
import { AdminChecklist, AdminCharts } from "@/components/common/RoleBlocks";
import { PageHeader } from "@/components/common/PageHeader";
import { metricsService, volunteerReportService, reportService, chatService } from "@/services";
import { Pager, usePagination } from "@/components/common/Pager";
import { StatCard } from "@/components/common/StatCard";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useState, useMemo } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Activity, Clock, FileText, HeartHandshake, History, MessagesSquare, ShieldAlert, Smile, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["metrics"], queryFn: metricsService.overview });
  const m = q.data;

  // Relatórios de voluntários
  const volunteerReports = useQuery({
    queryKey: ["admin-volunteer-reports"],
    queryFn: () => volunteerReportService.listAll(),
  });

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [adminFeedback, setAdminFeedback] = useState("");
  const [respondReportOpen, setRespondReportOpen] = useState(false);

  const respondReportMutation = useMutation({
    mutationFn: () => {
      if (!selectedReportId) throw new Error("Sem relatório selecionado");
      return volunteerReportService.respond(selectedReportId, adminFeedback);
    },
    onSuccess: () => {
      toast.success("Parecer do relatório registrado com sucesso.");
      setRespondReportOpen(false);
      setAdminFeedback("");
      setSelectedReportId(null);
      qc.invalidateQueries({ queryKey: ["admin-volunteer-reports"] });
    },
    onError: () => {
      toast.error("Não foi possível registrar o parecer.");
    },
  });

  // Reportes de moderador
  const moderatorReports = useQuery({
    queryKey: ["admin-moderator-reports"],
    queryFn: () => reportService.list(),
  });

  const [selectedModReportId, setSelectedModReportId] = useState<string | null>(null);
  const [modReportDecision, setModReportDecision] = useState("");
  const [resolveModReportOpen, setResolveModReportOpen] = useState(false);

  const resolveModReportMutation = useMutation({
    mutationFn: (status: "resolvido" | "arquivado") => {
      if (!selectedModReportId) throw new Error("Sem reporte selecionado");
      return reportService.setStatus(selectedModReportId, status, modReportDecision);
    },
    onSuccess: () => {
      toast.success("Reporte atualizado com sucesso.");
      setResolveModReportOpen(false);
      setModReportDecision("");
      setSelectedModReportId(null);
      qc.invalidateQueries({ queryKey: ["admin-moderator-reports"] });
    },
    onError: () => {
      toast.error("Não foi possível atualizar o reporte.");
    },
  });

  // Filtramos os reportes dos moderadores
  const filteredModReports = useMemo(() => {
    return (moderatorReports.data ?? []).filter((r) => r.reporterAlias !== "Sistema");
  }, [moderatorReports.data]);

  // Conversas para histórico / auditoria
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  
  const conversationsQuery = useQuery({
    queryKey: ["admin-conversations"],
    queryFn: chatService.getConversations,
  });

  const messagesQuery = useQuery({
    queryKey: ["admin-conversation-messages", selectedConvId],
    queryFn: () => chatService.getMessages(selectedConvId!),
    enabled: !!selectedConvId,
  });

  // Filtramos apenas as conversas encerradas (e que não sejam team_chat)
  const endedConversations = useMemo(() => {
    return (conversationsQuery.data ?? []).filter((c) => c.status === "ended" && !c.isTeamChat);
  }, [conversationsQuery.data]);

  const pgVol = usePagination(volunteerReports.data ?? [], 6);
  const pgMod = usePagination(filteredModReports, 6);
  const pgEnded = usePagination(endedConversations, 8);

  return (
    <AppShell>
      <HeroBanner icon={HeroIcon} title="Dashboard" description="Visão geral da plataforma." />

      <AdminChecklist />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Usuários" icon={Users} tone="primary" value={m?.totalUsers.toLocaleString("pt-BR") ?? "—"} />
        <StatCard label="Voluntários online" icon={HeartHandshake} tone="success" value={m?.totalVolunteers.toString() ?? "—"} />
        <StatCard label="Conversas hoje" icon={MessagesSquare} tone="accent" value={m?.conversationsToday.toString() ?? "—"} />
        <StatCard label="Satisfação" icon={Smile} tone="info" value={m && m.satisfactionRate > 0 ? `${m.satisfactionRate}%` : "—"} hint={m && m.satisfactionRate === 0 ? "Ainda sem avaliações" : undefined} />
      </div>

      <AdminCharts />

      <section className="mt-6 rounded-xl border bg-card p-4">
        <h2 className="font-display text-base font-semibold">Conversas na semana</h2>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m?.weekly ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
                labelStyle={{ color: "var(--foreground)" }}
              />
              <Bar dataKey="conversations" radius={[8, 8, 0, 0]} fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StatCard label="Conversas ativas" icon={Activity} tone="success" value={m?.activeConversations.toString() ?? "—"} />
        <StatCard label="Espera média na fila" icon={Clock} tone="primary" value={m ? `${m.avgWaitMinutes} min` : "—"} hint="De quem aguarda agora" />
      </div>

      <div className="mt-6">
        <Tabs defaultValue="relatorios-voluntarios">
          <TabsList className="mb-4 grid h-auto w-full grid-cols-3">
            <TabsTrigger value="relatorios-voluntarios" className="flex-col gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <FileText className="h-4 w-4" />
              <span className="sm:hidden">Voluntários</span>
              <span className="hidden sm:inline">Relatórios de Voluntários</span>
            </TabsTrigger>
            <TabsTrigger value="reportes-moderadores" className="flex-col gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <ShieldAlert className="h-4 w-4" />
              <span className="sm:hidden">Denúncias</span>
              <span className="hidden sm:inline">Denúncias e Reportes</span>
            </TabsTrigger>
            <TabsTrigger value="historico-atendimentos" className="flex-col gap-1 px-1 py-2 text-[11px] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm">
              <History className="h-4 w-4" />
              <span className="sm:hidden">Atendimentos</span>
              <span className="hidden sm:inline">Histórico de Acolhimentos</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="relatorios-voluntarios" className="space-y-4">
            <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
              {pgVol.pageItems.map((r) => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{r.title}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                        r.status === 'respondido' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {r.status === 'respondido' ? 'Respondido' : 'Pendente'}
                      </span>
                      {r.status === 'pendente' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedReportId(r.id);
                            setRespondReportOpen(true);
                          }}
                        >
                          Dar Parecer
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enviado por {r.volunteerName} em {new Date(r.createdAt).toLocaleString()} 
                    {r.targetUserName && ` · Usuário: ${r.targetUserName}`}
                  </p>
                  <p className="text-sm text-card-foreground/90 whitespace-pre-wrap">{r.description}</p>
                  {r.adminFeedback && (
                    <div className="mt-2 bg-muted/65 p-3 rounded-xl border border-muted-foreground/10 text-xs">
                      <p className="font-bold text-muted-foreground uppercase tracking-wider mb-1">Resposta do Admin:</p>
                      <p className="italic text-muted-foreground/90">{r.adminFeedback}</p>
                    </div>
                  )}
                </div>
              ))}
              {!volunteerReports.isPending && (volunteerReports.data?.length ?? 0) === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum relatório de voluntário enviado.
                </p>
              )}
            </div>
          <Pager {...pgVol} onPageChange={pgVol.setPage} />
          </TabsContent>

          <TabsContent value="reportes-moderadores" className="space-y-4">
            <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
              {pgMod.pageItems.map((r) => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{r.reason}</p>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {r.status === 'pendente' && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedModReportId(r.id);
                            setResolveModReportOpen(true);
                          }}
                        >
                          Resolver
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Denunciado por {r.reporterAlias} contra {r.reportedAlias} em {new Date(r.createdAt).toLocaleString()}
                  </p>
                  {r.details && <p className="text-sm text-card-foreground/90 whitespace-pre-wrap">{r.details}</p>}
                </div>
              ))}
              {!moderatorReports.isPending && filteredModReports.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum reporte de moderador enviado.
                </p>
              )}
            </div>
          <Pager {...pgMod} onPageChange={pgMod.setPage} />
          </TabsContent>

          <TabsContent value="historico-atendimentos" className="space-y-4">
            <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
              {pgEnded.pageItems.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">
                      {c.topic || "Acolhimento Emocional"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Acolhido: {c.userAlias} · Voluntário: {c.volunteerAlias || "Não atribuído"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Início: {new Date(c.startedAt).toLocaleString()}
                      {c.endedAt && ` · Fim: ${new Date(c.endedAt).toLocaleString()}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedConvId(c.id)}
                  >
                    Ver Conversa
                  </Button>
                </div>
              ))}
              {!conversationsQuery.isPending && endedConversations.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma conversa encerrada encontrada.
                </p>
              )}
            </div>
          <Pager {...pgEnded} onPageChange={pgEnded.setPage} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog para dar parecer no relatório de voluntário */}
      <Dialog open={respondReportOpen} onOpenChange={setRespondReportOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Registrar Parecer do Administrador</DialogTitle>
            <DialogDescription>
              Insira a resposta operacional para o voluntário sobre o relatório enviado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Parecer técnico / Resposta</label>
              <Textarea
                placeholder="Insira as observações da administração..."
                rows={4}
                value={adminFeedback}
                onChange={(e) => setAdminFeedback(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => respondReportMutation.mutate()}
              disabled={adminFeedback.trim().length < 5 || respondReportMutation.isPending}
            >
              {respondReportMutation.isPending ? "Salvando..." : "Salvar Parecer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para resolver reporte de moderador */}
      <Dialog open={resolveModReportOpen} onOpenChange={setResolveModReportOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Decidir Resolução do Reporte</DialogTitle>
            <DialogDescription>
              Escreva uma nota justificando a ação tomada para encerrar a denúncia de moderador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Nota de Resolução</label>
              <Textarea
                placeholder="Descreva a ação tomada (ex: Usuário suspenso temporariamente ou Denúncia considerada improcedente)..."
                rows={4}
                value={modReportDecision}
                onChange={(e) => setModReportDecision(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => resolveModReportMutation.mutate("arquivado")}
              disabled={modReportDecision.trim().length < 5 || resolveModReportMutation.isPending}
            >
              Arquivar (Ignorar)
            </Button>
            <Button
              onClick={() => resolveModReportMutation.mutate("resolvido")}
              disabled={modReportDecision.trim().length < 5 || resolveModReportMutation.isPending}
            >
              Marcar como Resolvido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para visualizar histórico completo */}
      <Dialog open={!!selectedConvId} onOpenChange={(open) => { if (!open) setSelectedConvId(null); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Histórico de Acolhimento</DialogTitle>
            <DialogDescription>
              Auditoria de mensagens trocadas durante o acolhimento.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1 min-h-[300px]">
            {messagesQuery.isPending && (
              <p className="text-center text-sm text-muted-foreground">Carregando mensagens...</p>
            )}
            {messagesQuery.data && messagesQuery.data.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem enviada.</p>
            )}
            {messagesQuery.data?.map((msg) => {
              const isSystem = msg.author === "system";
              const isUser = msg.author === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[80%] rounded-2xl p-3 text-sm ${
                    isSystem
                      ? "mx-auto bg-muted text-muted-foreground text-center text-xs border"
                      : isUser
                      ? "mr-auto bg-muted/60 text-card-foreground border"
                      : "ml-auto bg-primary text-primary-foreground animate-in fade-in"
                  }`}
                >
                  {!isSystem && (
                    <span className="text-[10px] font-bold opacity-75 mb-0.5 uppercase tracking-wide">
                      {isUser ? "Pessoa Acolhida" : "Voluntário"}
                    </span>
                  )}
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <span className="text-[9px] opacity-60 mt-1 self-end">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedConvId(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold">{value}</p>
    </div>
  );
}
