import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Inbox, MessageCircle, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CareRecordSheet } from "@/components/chat/CareRecordSheet";
import { Pager, usePagination } from "@/components/common/Pager";
import { Input } from "@/components/ui/input";
import { chatService } from "@/services";
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

function Transcript({ conversation }: { conversation: Conversation }) {
  const q = useQuery({
    queryKey: ["messages", conversation.id],
    queryFn: () => chatService.getMessages(conversation.id),
  });
  if (q.isPending) return <p className="px-4 pb-4 text-sm text-muted-foreground">Carregando…</p>;
  const list = q.data ?? [];
  if (list.length === 0)
    return (
      <p className="px-4 pb-4 text-sm text-muted-foreground">Sem mensagens nesta conversa.</p>
    );
  return (
    <ul className="space-y-2 px-4 pb-4">
      {list.map((m) => {
        if (m.author === "system")
          return (
            <li key={m.id} className="text-center text-xs text-muted-foreground">
              {m.text}
            </li>
          );
        const fromUser = m.senderId ? m.senderId === conversation.userId : m.author === "volunteer";
        return (
          <li
            key={m.id}
            className={
              fromUser
                ? "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2"
                : "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2"
            }
          >
            <span className="block text-xs font-semibold text-muted-foreground">
              {fromUser ? conversation.userAlias : (conversation.volunteerAlias ?? "Voluntário")}
            </span>
            <span className="block whitespace-pre-wrap break-words text-sm">{m.text}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {fmtDateTime(m.createdAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Histórico de atendimentos entre voluntários e usuários (visão da equipe). */
export function ConversationHistory({
  title = "Histórico de conversas",
  description = "Todas as conversas entre voluntários e usuários.",
  resume,
}: {
  title?: string;
  description?: string;
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
      <PageHeader title={title} description={description} />
      <div className="relative mb-4 max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar por usuário ou voluntário"
          className="pl-9"
          aria-label="Buscar conversas"
        />
      </div>

      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nenhuma conversa encontrada"
          description="Quando voluntários atenderem usuários, as conversas aparecem aqui."
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
          {pg.pageItems.map((c) => (
            <li key={c.id} className="row-hover">
              <div className="flex flex-wrap items-center gap-3 px-4 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(open === c.id ? null : c.id)}
                  className="min-w-0 flex-1 basis-48 text-left"
                  aria-expanded={open === c.id}
                >
                  <p className="truncate text-sm font-medium">
                    {c.userAlias} <span className="text-muted-foreground">↔</span>{" "}
                    {c.volunteerAlias ?? "sem voluntário"}
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(c.startedAt)}</p>
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
                  {open === c.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
              </div>
              {open === c.id && <Transcript conversation={c} />}
            </li>
          ))}
        </ul>
      )}
      <Pager {...pg} onPageChange={pg.setPage} />
    </>
  );
}
