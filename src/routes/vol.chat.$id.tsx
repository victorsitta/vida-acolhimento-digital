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
import { ChatRoom } from "@/components/chat/ChatRoom";
import { QuickReplies } from "@/components/chat/QuickReplies";
import { SupervisorButton } from "@/components/chat/SupervisorDialog";
import { detectRisk } from "@/lib/risk";

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
  // alerta para o voluntário: a pessoa escreveu algo com sinal de risco
  const riskHit = (messages.data ?? []).some((m) => m.author !== "user" && m.author !== "system" && detectRisk(m.text));
  const personInitials = personAlias
    .split(" ")
    .filter(Boolean)
    .map((p: string) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppShell>
      <ChatRoom
        toolbar={<QuickReplies onPick={(t) => setText((cur) => (cur.trim() ? `${cur} ${t}` : t))} />}
        conversationId={id}
        title={personAlias}
        subtitle="em atendimento · você pode sair e voltar quando quiser"
        avatarText={personAlias}
        onEnd={() => setEnded(true)}
        endLabel="Encerrar atendimento"
        scrollKey={(messages.data ?? []).length}
        actions={
          <>
            <CareRecordSheet
              userId={conversation.data?.userId}
              userAlias={conversation.data?.userAlias}
              conversationId={id}
            />
            <SupervisorButton conversationId={id} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowRisk(!showRisk)}
              aria-expanded={showRisk}
            >
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="hidden sm:inline">Risco</span>
            </Button>
          </>
        }
        panel={
          riskHit && !showRisk ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              <p className="min-w-0 flex-1 basis-56">
                A pessoa escreveu algo com <strong>possível sinal de risco</strong>. Pergunte com cuidado e, se preciso, acione o CVV 188 ou o SAMU 192.
              </p>
              <Button size="sm" variant="destructive" onClick={() => setShowRisk(true)}>
                Sinalizar risco
              </Button>
            </div>
          ) : showRisk ? (
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
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={riskReason.trim().length < 5 || flagRisk.isPending}
                onClick={() => flagRisk.mutate()}
              >
                {flagRisk.isPending ? "Registrando..." : "Registrar sinalização"}
              </Button>
            </div>
          ) : undefined
        }
        typing={isTyping ? <div className="mb-2"><TypingDots label={`${typingUser || personAlias} está digitando…`} /></div> : undefined}
        replyBar={
          replyingTo ? (
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
          ) : undefined
        }
        composer={{
          value: text,
          onChange: handleTextChange,
          onSubmit: () => send.mutate({ text: text.trim(), replyToId: replyingTo?.id }),
          sending: send.isPending,
          onSticker: (st: string) => send.mutate({ text: st, replyToId: replyingTo?.id }),
          placeholder: "Escreva uma mensagem…",
        }}
      >
        {messages.isPending && (
          <p className="pt-8 text-center text-xs text-muted-foreground">Carregando conversa…</p>
        )}
        {(messages.data ?? []).map((message, idx, arr) => {
          if (message.author === "system") {
            return <ChatNotice key={message.id}>{message.text}</ChatNotice>;
          }
          const replyToMessage = message.replyToId
            ? (messages.data ?? []).find((msg) => msg.id === message.replyToId)
            : undefined;
          return (
            <ChatBubble
              key={message.id}
              prevCreatedAt={arr[idx - 1]?.createdAt}
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
      </ChatRoom>
    </AppShell>
  );
}
