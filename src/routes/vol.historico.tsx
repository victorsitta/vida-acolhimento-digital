import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Inbox } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { chatService } from "@/services";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CareRecordSheet } from "@/components/chat/CareRecordSheet";
import { fmtDateTime } from "@/utils/format";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/vol/historico")({
  head: () => ({ meta: [{ title: "Histórico de atendimentos — VIDA+" }] }),
  component: Page,
});

function Transcript({ conversationId }: { conversationId: string }) {
  const q = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => chatService.getMessages(conversationId),
  });
  if (q.isPending) return <p className="px-4 pb-4 text-xs text-muted-foreground">Carregando…</p>;
  const list = q.data ?? [];
  if (list.length === 0)
    return <p className="px-4 pb-4 text-xs text-muted-foreground">Sem mensagens nesta conversa.</p>;
  return (
    <ul className="space-y-2 px-4 pb-4">
      {list.map((m) => (
        <li
          key={m.id}
          className={
            m.author === "user"
              ? "ml-auto max-w-[80%] rounded-2xl bg-primary/10 px-3 py-2 text-sm"
              : m.author === "system"
                ? "mx-auto text-center text-xs text-muted-foreground"
                : "mr-auto max-w-[80%] rounded-2xl bg-muted px-3 py-2 text-sm"
          }
        >
          {m.text}
          <span className="mt-1 block text-[10px] text-muted-foreground">
            {fmtDateTime(m.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Page() {
  useAuthGuard();
  const q = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations });
  const [open, setOpen] = useState<string | null>(null);
  // histórico = atendimentos já iniciados (a fila fica na tela "Fila")
  const list = (q.data ?? []).filter((c) => c.status !== "waiting" && !c.isTeamChat);

  return (
    <AppShell>
      <PageHeader
        title="Histórico de atendimentos"
        description="Suas conversas com cada pessoa e o prontuário de cada uma."
      />
      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nenhum atendimento ainda"
          description="Quando você aceitar alguém da fila, a conversa aparecerá aqui."
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
          {list.map((c) => (
            <li key={c.id}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  className="min-w-0 text-left"
                  aria-expanded={open === c.id}
                >
                  <p className="truncate text-sm font-medium">{c.userAlias}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(c.startedAt)}</p>
                </button>
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-neutral-900">
                    <CareRecordSheet
                      userId={c.userId}
                      userAlias={c.userAlias}
                      conversationId={c.id}
                    />
                  </div>
                  <StatusBadge status={c.status} />
                  {open === c.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              {open === c.id && <Transcript conversationId={c.id} />}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
