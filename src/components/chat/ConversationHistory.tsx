import { SearchInput } from "@/components/common/SearchInput";
import { downloadCsv } from "@/lib/csv";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, MessageCircle, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ChatBubble, ChatNotice } from "@/components/chat/ChatBubble";
import { TranscriptDialog } from "@/components/chat/TranscriptDialog";
import { CareRecordSheet } from "@/components/chat/CareRecordSheet";
import { Pager, usePagination } from "@/components/common/Pager";
import { Input } from "@/components/ui/input";
import { chatService } from "@/services";
import { logAudit } from "@/services/audit";
import { fmtDateTime } from "@/utils/format";
import type { Conversation } from "@/types";
import { cn } from "@/lib/utils";

function Rating({ conversationId, value }: { conversationId: string; value?: number }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (n: number) => chatService.rate(conversationId, n),
    onSuccess: () => {
      toast.success("Obrigado pela avaliação!");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast.error("Não foi possível salvar a avaliação."),
  });
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Avaliar atendimento">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!!value || m.isPending}
          onClick={() => m.mutate(n)}
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
          className="rounded p-0.5 disabled:cursor-default"
        >
          <Star
            className={cn(
              "h-4 w-4 transition",
              n <= (value ?? 0) ? "fill-primary text-primary" : "text-muted-foreground hover:text-primary",
            )}
          />
        </button>
      ))}
    </div>
  );
}

function Transcript({ conversation, identity }: { conversation: Conversation; identity?: boolean }) {
  const q = useQuery({
    queryKey: ["messages", conversation.id],
    queryFn: async () => {
      const list = await chatService.getMessages(conversation.id);
      void logAudit("atendimento.conversa_lida", "atendimento", conversation.id, { mensagens: list.length }, 5 * 60_000);
      return list;
    },
  });
  if (q.isPending) return <p className="px-4 pb-4 text-sm text-muted-foreground">Carregando…</p>;
  const list = q.data ?? [];
  if (list.length === 0)
    return (
      <p className="px-4 pb-4 text-sm text-muted-foreground">Sem mensagens nesta conversa.</p>
    );
  return (
    <ul className="space-y-3 px-3 pb-4 sm:px-4">
      {list.map((m, idx) => {
        if (m.author === "system") return <ChatNotice key={m.id}>{m.text}</ChatNotice>;
        const fromUser = m.senderId ? m.senderId === conversation.userId : m.author === "volunteer";
        return (
          <li key={m.id}>
            <ChatBubble
              prevCreatedAt={list[idx - 1]?.createdAt}
              mine={!fromUser}
              text={m.text}
              createdAt={m.createdAt}
              name={fromUser ? personName(conversation, identity) : (conversation.volunteerAlias ?? "Voluntário")}
              showAvatar
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Para a moderação: nome real quando disponível; para os demais: o apelido. */
function personName(c: Conversation, identity?: boolean) {
  return identity && c.userName ? c.userName : c.userAlias;
}

/** Histórico de atendimentos entre voluntários e usuários (visão da equipe). */
export function ConversationHistory({
  title = "Histórico de conversas",
  description = "Todas as conversas entre voluntários e usuários.",
  resume,
  identity = false,
}: {
  title?: string;
  description?: string;
  /** mostra nome e e-mail reais das duas pessoas (somente moderador/administrador) */
  identity?: boolean;
  /** Quem participa pode voltar a uma conversa em andamento (voluntário ou usuário). */
  resume?: "vol" | "app";
}) {
  const q = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations });
  const [open, setOpen] = useState<string | null>(null);
  const [term, setTerm] = useState("");

  const list = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (q.data ?? [])
      .filter((c) => c.status !== "waiting" && !c.isTeamChat)
      .filter(
        (c) =>
          !t ||
          c.userAlias.toLowerCase().includes(t) ||
          (c.volunteerAlias ?? "").toLowerCase().includes(t),
      );
  }, [q.data, term]);

  const pg = usePagination(list, 10);
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          resume !== "app" && list.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                downloadCsv(
                  "conversas",
                  identity
                    ? ["Pessoa", "E-mail da pessoa", "Voluntário", "E-mail do voluntário", "Início", "Situação", "Nota"]
                    : ["Pessoa", "Voluntário", "Início", "Situação", "Nota"],
                  list.map((c) =>
                    identity
                      ? [personName(c, true), c.userEmail, c.volunteerAlias, c.volunteerEmail, c.startedAt, c.status, c.rating]
                      : [c.userAlias, c.volunteerAlias, c.startedAt, c.status, c.rating],
                  ),
                )
              }
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          ) : undefined
        }
      />
      <SearchInput value={term} onChange={setTerm} placeholder="Buscar por usuário ou voluntário" className="max-w-md" />

      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Inbox}
          illustration="chat"
          title="Nenhuma conversa encontrada"
          description="Quando voluntários atenderem usuários, as conversas aparecem aqui."
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
          {pg.pageItems.map((c) => (
            <li key={c.id} className="row-hover">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(c.id)}
                  className="min-w-0 flex-1 basis-48 text-left"
                  aria-haspopup="dialog"
                >
                  <p className="truncate text-sm font-medium">
                    {personName(c, identity)} <span className="text-muted-foreground">↔</span>{" "}
                    {c.volunteerAlias ?? "sem voluntário"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {identity && (c.userEmail || c.volunteerEmail)
                      ? `${c.userEmail ?? "—"} · ${c.volunteerEmail ?? "—"} · `
                      : ""}
                    {fmtDateTime(c.startedAt)}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  {c.status === "active" && resume === "vol" && (
                    <Button asChild size="sm" className="gap-1.5">
                      <Link to="/vol/chat/$id" params={{ id: c.id }}>
                        <MessageCircle className="h-4 w-4" /> Voltar à conversa
                      </Link>
                    </Button>
                  )}
                  {c.status === "active" && resume === "app" && (
                    <Button asChild size="sm" className="gap-1.5">
                      <Link to="/app/chat/$id" params={{ id: c.id }}>
                        <MessageCircle className="h-4 w-4" /> Voltar à conversa
                      </Link>
                    </Button>
                  )}
                  {resume === "app" && c.status === "ended" && (
                    <Rating conversationId={c.id} value={c.rating} />
                  )}
                  {resume !== "app" && (
                    <CareRecordSheet
                      userId={c.userId}
                      userAlias={c.userAlias}
                      conversationId={c.id}
                    />
                  )}
                  <StatusBadge status={c.status} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setOpen(c.id)}
                  >
                    <MessageCircle className="h-4 w-4" /> Abrir conversa
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager {...pg} onPageChange={pg.setPage} />

      {(() => {
        const c = (q.data ?? []).find((x) => x.id === open);
        return (
          <TranscriptDialog
            open={!!c}
            onOpenChange={(o) => !o && setOpen(null)}
            title={c ? `${personName(c, identity)} ↔ ${c.volunteerAlias ?? "sem voluntário"}` : ""}
            subtitle={
              c
                ? identity
                  ? `${personName(c, identity)}${c.userEmail ? ` (${c.userEmail})` : ""} · ${c.volunteerAlias ?? "voluntário"}${c.volunteerEmail ? ` (${c.volunteerEmail})` : ""} · ${fmtDateTime(c.startedAt)}`
                  : `Iniciada em ${fmtDateTime(c.startedAt)}`
                : undefined
            }
            scrollKey={c?.id}
            actions={
              c && resume !== "app" ? (
                <CareRecordSheet userId={c.userId} userAlias={c.userAlias} conversationId={c.id} />
              ) : undefined
            }
          >
            {c && <Transcript conversation={c} identity={identity} />}
          </TranscriptDialog>
        );
      })()}
    </>
  );
}
