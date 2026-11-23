import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CornerUpLeft, MoreHorizontal, X } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { chatService, userService } from "@/services";
import { fmtTime } from "@/utils/format";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { http } from "@/services/api/client";
import { CareRecordSheet } from "@/components/chat/CareRecordSheet";
import { ChatBubble, ChatNotice, TypingDots } from "@/components/chat/ChatBubble";

export const Route = createFileRoute("/vol/chat/$id")({
  head: () => ({ meta: [{ title: "Atendimento — VIDA+" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const [text, setText] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [riskLevel, setRiskLevel] = useState("baixo");
  const [riskReason, setRiskReason] = useState("");
  const [ended, setEnded] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showRisk, setShowRisk] = useState(false);

  useAuthGuard();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => userService.me(),
  });

  const messages = useQuery({
    queryKey: ["messages", id],
    queryFn: () => chatService.getMessages(id),
    refetchInterval: 3000,
  });

  const conversation = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => chatService.getConversation(id),
    refetchInterval: 3000,
  });

  const { typingUser, isTyping } = useChatRealtime(id);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data?.length]);

  useEffect(() => {
    if (conversation.data?.status !== "ended" || ended) return;
    const endedAgoMin = conversation.data.endedAt
      ? (Date.now() - new Date(conversation.data.endedAt).getTime()) / 60000
      : 0;
    if (endedAgoMin > 15) {
      // conversa antiga: não dá para voltar, só consultar no histórico
      toast.info("Esta conversa já foi encerrada. Você pode relê-la no histórico.");
      navigate({ to: "/vol/historico", replace: true });
      return;
    }
    // acabou de encerrar: o voluntário registra o prontuário
    setEnded(true);
    toast.info(
      conversation.data.closedReason === "voluntario_encerrou"
        ? "Você encerrou a conversa."
        : "A pessoa acolhida encerrou a conversa. Registre o prontuário.",
    );
  }, [conversation.data?.status, conversation.data?.endedAt, ended]);

  const send = useMutation({
    mutationFn: ({ text: val, replyToId }: { text: string; replyToId?: string }) =>
      chatService.sendMessage(id, val, "volunteer", replyToId),
    onMutate: () => {
      setText("");
    },
    onSuccess: (message) => {
      qc.setQueryData<ChatMessage[]>(["messages", id], (current) => {
        const existing = current ?? [];
        if (existing.some((m) => m.id === message.id)) return existing;
        return [...existing, message];
      });
      setReplyingTo(null);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      isTypingRef.current = false;
      chatService.sendTyping(id, false);
    },
    onError: () => toast.error("Nao foi possivel enviar a mensagem."),
  });

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setText(value);
    if (value.trim()) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        chatService.sendTyping(id, true);
      }
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        isTypingRef.current = false;
        chatService.sendTyping(id, false);
      }, 2500);
    } else {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        if (typingTimer.current) clearTimeout(typingTimer.current);
        chatService.sendTyping(id, false);
      }
    }
  };

  const flagRisk = useMutation({
    mutationFn: () =>
      http(`/conversations/${id}/risk-flags`, {
        method: "POST",
        body: JSON.stringify({ level: riskLevel, reason: riskReason }),
      }),
    onSuccess: () => {
      toast.warning(`Risco ${riskLevel} registrado. Equipe notificada.`);
      setRiskReason("");
      setShowRisk(false);
    },
    onError: () => toast.error("Nao foi possivel registrar a sinalizacao."),
  });

  const endConversation = useMutation({
    mutationFn: (notes?: string) => chatService.endConversation(id, notes, "voluntario"),
    onSuccess: () => {
      toast.success("Atendimento registrado e encerrado.");
      navigate({ to: "/vol" });
    },
    onError: () => toast.error("Nao foi possivel encerrar o atendimento."),
  });

  const volunteerName = me.data?.name ?? "Voluntario";
  const initials = volunteerName
    .split(" ")
    .filter(Boolean)
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (ended) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl pt-8">
          <div className="rounded-3xl border bg-card p-8 shadow-soft">
            <h3 className="text-lg font-semibold">Registro do atendimento</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Descreva brevemente a acao tomada (sem dados sensiveis). Este registro fica salvo para consulta futura.
            </p>
            <Textarea
              rows={5}
              className="mt-4"
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder="Ex: Usuario relatou ansiedade elevada. Ofereci escuta ativa e tecnicas de respiracao."
            />
            <div className="mt-4 flex gap-3">
              <Button
                disabled={endConversation.isPending}
                onClick={() => endConversation.mutate(actionTaken.trim() || undefined)}
              >
                {endConversation.isPending ? "Salvando..." : "Salvar e finalizar"}
              </Button>
              <Button variant="ghost" onClick={() => navigate({ to: "/vol" })}>
                Pular
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const personAlias = conversation.data?.userAlias ?? "Pessoa acolhida";
  const personInitials = personAlias
    .split(" ")
    .filter(Boolean)
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-3 pb-8">
        <div className="flex h-[calc(100dvh-13rem)] min-h-[26rem] flex-col overflow-hidden rounded-3xl border bg-card shadow-soft">
          {/* Cabeçalho */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-b from-primary/10 to-transparent px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {personInitials}
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{personAlias}</p>
                <p className="text-xs text-muted-foreground">
                  em atendimento · você pode sair e voltar quando quiser
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <CareRecordSheet
                userId={conversation.data?.userId}
                userAlias={conversation.data?.userAlias}
                conversationId={id}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setShowRisk(!showRisk)}
                aria-label="Sinalizar risco"
                aria-expanded={showRisk}
              >
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </Button>
            </div>
          </div>

          {/* Painel de risco */}
          {showRisk && (
            <div className="space-y-2 border-b bg-muted/40 px-4 py-4 animate-in fade-in slide-in-from-top-2 sm:px-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Sinalizar risco
              </p>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixo">Baixo</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                  <SelectItem value="imediato">Imediato</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                rows={2}
                value={riskReason}
                onChange={(e) => setRiskReason(e.target.value)}
                placeholder="Descreva o sinal observado..."
                className="resize-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={riskReason.trim().length < 5 || flagRisk.isPending}
                  onClick={() => flagRisk.mutate()}
                >
                  {flagRisk.isPending ? "Registrando..." : "Registrar sinalização"}
                </Button>
                <Button size="sm" variant="destructive" className="flex-1" onClick={() => setEnded(true)}>
                  Encerrar atendimento
                </Button>
              </div>
            </div>
          )}

          {/* Mensagens */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-4 sm:px-5"
            aria-live="polite"
          >
            <div className="flex flex-col gap-3">
              {messages.isPending && (
                <p className="pt-8 text-center text-xs text-muted-foreground">Carregando conversa…</p>
              )}
              {(messages.data ?? []).map((message) => {
                if (message.author === "system") {
                  return <ChatNotice key={message.id}>{message.text}</ChatNotice>;
                }
                const replyToMessage = message.replyToId
                  ? (messages.data ?? []).find((msg) => msg.id === message.replyToId)
                  : undefined;
                return (
                  <ChatBubble
                    key={message.id}
                    mine={message.author === "user"}
                    text={message.text}
                    createdAt={message.createdAt}
                    name={message.author === "user" ? undefined : personAlias}
                    showAvatar
                    status={message.status}
                    reply={
                      replyToMessage
                        ? {
                            author: replyToMessage.author === "user" ? "Você" : personAlias,
                            text: replyToMessage.text,
                          }
                        : undefined
                    }
                    onReply={() => setReplyingTo(message)}
                  />
                );
              })}
              {isTyping && <TypingDots label={`${typingUser || personAlias} está digitando…`} />}
            </div>
          </div>

          {/* Composer */}
          <div className="border-t bg-card px-3 py-3 sm:px-4">
            {replyingTo && (
              <div className="mb-2 flex items-center justify-between rounded-xl border-l-2 border-primary bg-muted/60 px-3 py-2 text-xs animate-in fade-in slide-in-from-bottom-1">
                <div className="min-w-0">
                  <span className="block font-semibold text-primary">
                    Respondendo a {replyingTo.author === "user" ? "você" : personAlias}
                  </span>
                  <span className="line-clamp-1 text-muted-foreground">{replyingTo.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="ml-2 text-muted-foreground hover:text-foreground"
                  aria-label="Cancelar resposta"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = text.trim();
                if (value) send.mutate({ text: value, replyToId: replyingTo?.id });
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="volunteer-message" className="sr-only">
                Mensagem
              </label>
              <Textarea
                id="volunteer-message"
                rows={1}
                value={text}
                onChange={handleTextChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const value = text.trim();
                    if (value) send.mutate({ text: value, replyToId: replyingTo?.id });
                  }
                }}
                placeholder="Escreva uma mensagem…"
                className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl"
              />
              <Button type="submit" disabled={!text.trim() || send.isPending} className="h-10 rounded-2xl px-5">
                Enviar
              </Button>
            </form>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setEnded(true)}
          >
            Encerrar atendimento
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
