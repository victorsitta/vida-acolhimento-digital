import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Hourglass,
  MessageCircleHeart,
  Smile,
  Star,
  UsersRound,
  Zap,
  ShieldAlert,
  HeartPulse,
  BookOpen,
  Settings,
} from "lucide-react";
import { GettingStarted } from "@/components/common/GettingStarted";
import { StatCard } from "@/components/common/StatCard";
import {
  adminCommunityService,
  applicationService,
  chatService,
  communityService,
  ratingService,
  reportService,
  wellbeingService,
} from "@/services";
import { fmtRelative } from "@/utils/format";

/* ───────────── Primeiros passos por papel ───────────── */

export function UserChecklist() {
  const mood = useQuery({ queryKey: ["mood"], queryFn: wellbeingService.list, retry: false });
  const groups = useQuery({ queryKey: ["communities"], queryFn: communityService.list, retry: false });
  const convs = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations, retry: false });
  return (
    <GettingStarted
      storageKey="vida:start:user"
      title="Primeiros passos"
      items={[
        { id: "checkin", label: "Faça seu primeiro check-in", hint: "Conte como você está hoje", to: "/app/bem-estar", icon: HeartPulse, done: mood.isSuccess ? (mood.data?.length ?? 0) > 0 : undefined },
        { id: "grupo", label: "Entre em um grupo de apoio", hint: "Converse só com um apelido", to: "/app/comunidades", icon: UsersRound, done: groups.isSuccess ? (groups.data ?? []).some((g) => g.joined) : undefined },
        { id: "conversa", label: "Converse com um voluntário", hint: "Escuta sem julgamento", to: "/app/conversar", icon: MessageCircleHeart, done: convs.isSuccess ? (convs.data ?? []).length > 0 : undefined },
        { id: "perfil", label: "Escolha seu apelido público", hint: "É o nome que aparece nos grupos", to: "/app/perfil", icon: Settings },
      ]}
    />
  );
}

export function VolunteerChecklist() {
  const convs = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations, retry: false });
  return (
    <GettingStarted
      storageKey="vida:start:vol"
      title="Primeiros passos como voluntário"
      items={[
        { id: "online", label: "Fique online", hint: "Assim as pessoas conseguem te encontrar", to: "/vol", icon: Zap },
        { id: "fila", label: "Conheça a fila de atendimento", hint: "Veja quem aguarda e ligue os avisos", to: "/vol/fila", icon: Hourglass },
        { id: "atender", label: "Atenda a primeira pessoa", hint: "Respostas rápidas ajudam no começo", to: "/vol/fila", icon: MessageCircleHeart, done: convs.isSuccess ? (convs.data ?? []).some((c) => !c.isTeamChat && c.status !== "waiting") : undefined },
        { id: "notas", label: "Veja suas avaliações", hint: "O que acharam do seu atendimento", to: "/vol/avaliacoes", icon: Star },
      ]}
    />
  );
}

export function ModeratorChecklist() {
  const reports = useQuery({ queryKey: ["reports"], queryFn: reportService.list, retry: false });
  return (
    <GettingStarted
      storageKey="vida:start:mod"
      title="Primeiros passos na moderação"
      items={[
        { id: "resolver", label: "Resolva uma denúncia", hint: "Use as medidas de moderação", to: "/mod", icon: ShieldAlert, done: reports.isSuccess ? (reports.data ?? []).some((r) => r.status === "resolvido") : undefined },
        { id: "grupos", label: "Conheça os grupos", hint: "Veja a conversa e remova abusos", to: "/admin/comunidades", icon: UsersRound },
        { id: "conversas", label: "Leia o histórico de conversas", hint: "Nome e e-mail reais para a equipe", to: "/mod/historico", icon: BookOpen },
        { id: "avaliacoes", label: "Veja as avaliações da moderação", hint: "Como avaliaram seus casos", to: "/mod/avaliacoes", icon: Star },
      ]}
    />
  );
}

export function AdminChecklist() {
  const groups = useQuery({ queryKey: ["admin-communities"], queryFn: adminCommunityService.list, retry: false });
  const apps = useQuery({ queryKey: ["applications"], queryFn: applicationService.list, retry: false });
  return (
    <GettingStarted
      storageKey="vida:start:admin"
      title="Primeiros passos como administrador"
      items={[
        { id: "grupo", label: "Crie um grupo de apoio", hint: "Cada grupo tem suas regras", to: "/admin/comunidades", icon: UsersRound, done: groups.isSuccess ? (groups.data ?? []).length > 0 : undefined },
        { id: "cand", label: "Analise uma candidatura", hint: "Voluntários e moderadores", to: "/admin/candidaturas", icon: ClipboardList, done: apps.isSuccess ? (apps.data ?? []).some((a) => a.status !== "pendente") : undefined },
        { id: "logs", label: "Conheça os logs de auditoria", hint: "Tudo o que acontece fica registrado", to: "/admin/logs", icon: Activity },
        { id: "papeis", label: "Revise papéis e usuários", hint: "Promova quem merece", to: "/admin/usuarios", icon: Settings },
      ]}
    />
  );
}

/* ───────────── Números do voluntário ───────────── */

export function VolunteerStats() {
  const convs = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations, retry: false });
  const ratings = useQuery({ queryKey: ["ratings", "volunteers"], queryFn: ratingService.list, retry: false });
  const mine = (convs.data ?? []).filter((c) => !c.isTeamChat && c.status !== "waiting");
  const today = mine.filter((c) => new Date(c.startedAt).toDateString() === new Date().toDateString()).length;
  const r = ratings.data ?? [];
  const avg = r.length ? r.reduce((a, b) => a + b.rating, 0) / r.length : 0;
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard label="Atendimentos hoje" icon={CalendarCheck} tone="primary" value={String(today)} />
      <StatCard label="Total de atendimentos" icon={CheckCircle2} tone="success" value={String(mine.length)} />
      <StatCard
        label="Minha nota média"
        icon={Star}
        tone="accent"
        value={r.length ? avg.toFixed(1).replace(".", ",") : "—"}
        hint={r.length ? `${r.length} avaliaç${r.length > 1 ? "ões" : "ão"}` : "Ainda sem avaliações"}
      />
    </div>
  );
}

/* ───────────── Números da moderação ───────────── */

export function ModeratorStats() {
  const q = useQuery({ queryKey: ["reports"], queryFn: reportService.list, retry: false });
  const list = q.data ?? [];
  const pending = list.filter((r) => r.status === "pendente");
  const analysing = list.filter((r) => r.status === "em_analise").length;
  const weekAgo = Date.now() - 7 * 86400_000;
  const solved = list.filter((r) => r.status === "resolvido" && new Date(r.resolvedAt ?? r.createdAt).getTime() > weekAgo).length;
  const oldest = pending.length ? pending.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)) : null;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Pendentes" icon={ShieldAlert} tone="accent" value={String(pending.length)} hint={oldest ? `Mais antiga: ${fmtRelative(oldest.createdAt)}` : "Nada na fila"} />
      <StatCard label="Em análise" icon={Hourglass} tone="primary" value={String(analysing)} />
      <StatCard label="Resolvidas (7 dias)" icon={CheckCircle2} tone="success" value={String(solved)} />
      <StatCard label="Total de denúncias" icon={Smile} tone="info" value={String(list.length)} />
    </div>
  );
}

/* ───────────── Gráficos do administrador ───────────── */

const STATUS_LABEL: Record<string, string> = { waiting: "Aguardando", active: "Em andamento", ended: "Encerradas" };
const STATUS_COLOR: Record<string, string> = { waiting: "var(--warning)", active: "var(--success)", ended: "var(--primary)" };

export function AdminCharts() {
  const q = useQuery({ queryKey: ["admin-conversations"], queryFn: chatService.getConversations, retry: false });
  const list = useMemo(() => (q.data ?? []).filter((c) => !c.isTeamChat), [q.data]);

  const byStatus = useMemo(
    () =>
      (["ended", "active", "waiting"] as const)
        .map((s) => ({ key: s, name: STATUS_LABEL[s], value: list.filter((c) => c.status === s).length }))
        .filter((d) => d.value > 0),
    [list],
  );
  const byHour = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hora: `${String(i).padStart(2, "0")}h`, atendimentos: 0 }));
    for (const c of list) h[new Date(c.startedAt).getHours()].atendimentos++;
    return h;
  }, [list]);
  const peak = byHour.reduce((a, b) => (b.atendimentos > a.atendimentos ? b : a), byHour[0]);

  if (!list.length) return null;
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Horários de pico</h2>
            <p className="text-xs text-muted-foreground">Quando as pessoas mais procuram atendimento</p>
          </div>
          {peak.atendimentos > 0 && (
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">Pico às {peak.hora}</span>
          )}
        </div>
        <div className="mt-4 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byHour} margin={{ left: -24, right: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hora" tickLine={false} axisLine={false} interval={2} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
              <Bar dataKey="atendimentos" name="Atendimentos" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="text-sm font-semibold">Atendimentos por situação</h2>
        <p className="text-xs text-muted-foreground">{list.length} no total</p>
        <div className="mt-2 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={34} outerRadius={56} paddingAngle={3} stroke="none">
                {byStatus.map((d) => (
                  <Cell key={d.key} fill={STATUS_COLOR[d.key]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 space-y-1.5 text-xs">
          {byStatus.map((d) => (
            <li key={d.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[d.key] }} />
              <span className="flex-1 text-muted-foreground">{d.name}</span>
              <strong className="tabular-nums">{d.value}</strong>
            </li>
          ))}
        </ul>
        <Link to="/admin/historico" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
          Ver todas as conversas →
        </Link>
      </section>
    </div>
  );
}
