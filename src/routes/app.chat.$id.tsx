import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerUpLeft, Send, ShieldAlert, X } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { Button } from "@/components/ui/button";
import { chatService } from "@/services";
import { fmtTime } from "@/utils/format";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ChatMessage } from "@/types";
import { toast } from "sonner";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useChatRealtime } from "@/hooks/useChatRealtime";
import { ChatBubble, ChatNotice, TypingDots } from "@/components/chat/ChatBubble";
import { ChatRoom } from "@/components/chat/ChatRoom";

export const Route = createFileRoute("/app/chat/$id")({
  head: () => ({ meta: [{ title: "Conversa — VIDA+" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [endOpen, setEndOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useAuthGuard();

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

  // Tempo real — recebe mensagens e eventos de digitação em tempo real do voluntário
  const { typingUser, isTyping } = useChatRealtime(id);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data?.length]);

  useEffect(() => {
    if (conversation.data?.status === "ended") {
      toast.info(
        conversation.data.closedReason === "usuario_encerrou"
          ? "Conversa encerrada."
          : "O voluntário encerrou a conversa. Você pode relê-la e avaliar no histórico.",
      );
      navigate({ to: "/app/historico" });
    }
  }, [conversation.data?.status]);

  const send = useMutation({
    mutationFn: ({ text, replyToId }: { text: string; replyToId?: string }) =>
      chatService.sendMessage(id, text, "user", replyToId),
    onMutate: async ({ text: t, replyToId }) => {
      const tempId = `tmp-${Date.now()}`;
      await qc.cancelQueries({ queryKey: ["messages", id] });
      const prev = qc.getQueryData<ChatMessage[]>(["messages", id]) ?? [];
      qc.setQueryData<ChatMessage[]>(
        ["messages", id],
        [
          ...prev,
          {
            id: tempId,
            conversationId: id,
            author: "user",
            text: t,
            createdAt: new Date().toISOString(),
            status: "sending",
            replyToId,
          },
        ],
      );
      return { tempId, prev };
    },
    onSuccess: (msg, _variables, ctx) => {
      qc.setQueryData<ChatMessage[]>(["messages", id], (curr) => {
        const list = curr ?? [];
        if (list.some((m) => m.id === msg.id)) {
          return list.filter((m) => m.id !== ctx?.tempId);
        }
        return list.map((m) => (m.id === ctx?.tempId ? msg : m));
      });
      setReplyingTo(null);
    },
    onError: (_e, _variables, ctx) => {
      qc.setQueryData<ChatMessage[]>(["messages", id], (curr) =>
        (curr ?? []).map((m) => (m.id === ctx?.tempId ? { ...m, status: "error" } : m)),
      );
      toast.error("Não foi possível enviar. Toque para reenviar.");
    },
  });

  const endConversation = useMutation({
    mutationFn: () => chatService.endConversation(id),
    onSuccess: () => {
      toast.success("Conversa encerrada. Você pode avaliar o atendimento no histórico.");
      navigate({ to: "/app/historico" });
    },
    onError: () => toast.error("Não foi possível encerrar. Tente novamente."),
  });

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (val.trim()) {
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

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    if (typingTimer.current) clearTimeout(typingTimer.current);
    isTypingRef.current = false;
    chatService.sendTyping(id, false);
    send.mutate({ text: t, replyToId: replyingTo?.id });
  };

  const volunteerName = conversation.data?.volunteerAlias || "Voluntário";

  return (
    <AppShell>
      <ChatRoom
        title={volunteerName}
        subtitle="Conversa em andamento · confidencial"
        avatarText={volunteerName}
        onEnd={() => setEndOpen(true)}
        endLabel="Encerrar conversa"
        notice="Esta conversa é confidencial. VIDA+ oferece escuta, não diagnóstico médico."
        scrollKey={(messages.data ?? []).length}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/app/denuncia" })}
            className="gap-1.5"
          >
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <span className="hidden sm:inline">Denunciar</span>
          </Button>
        }
        typing={
          isTyping ? (
            <div className="mb-2">
              <TypingDots label={`${typingUser || volunteerName} está digitando…`} />
            </div>
          ) : undefined
        }
        replyBar={
          replyingTo ? (
            <div className="mb-2 flex items-center justify-between rounded-xl border-l-2 border-primary bg-muted/60 px-3 py-2 text-xs animate-in fade-in slide-in-from-bottom-1">
              <div className="min-w-0">
                <span className="block font-semibold text-primary">
                  Respondendo a {replyingTo.author === "user" ? "você" : volunteerName}
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
          onSubmit: handleSend,
          placeholder: "Escreva como está se sentindo…",
        }}
      >
        {messages.isPending && (
          <p className="text-center text-xs text-muted-foreground">Carregando…</p>
        )}
        {(messages.data ?? []).map((m, idx, arr) => {
          const replyToMessage = m.replyToId
            ? (messages.data ?? []).find((msg) => msg.id === m.replyToId)
            : undefined;
          return (
            <Bubble
              key={m.id}
              prev={arr[idx - 1]?.createdAt}
              message={m}
              replyToMessage={replyToMessage}
              onRetry={() => send.mutate({ text: m.text, replyToId: m.replyToId })}
              onReply={() => setReplyingTo(m)}
            />
          );
        })}
      </ChatRoom>

      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao encerrar, esta conversa será finalizada. Você poderá iniciar uma nova quando
              quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar conversando</AlertDialogCancel>
            <AlertDialogAction
              disabled={endConversation.isPending}
              onClick={() => endConversation.mutate()}
            >
              {endConversation.isPending ? "Encerrando…" : "Encerrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Bubble({
  message,
  prev,
  replyToMessage,
  onRetry,
  onReply,
}: {
  message: ChatMessage;
  prev?: string;
  replyToMessage?: ChatMessage;
  onRetry: () => void;
  onReply?: () => void;
}) {
  if (message.author === "system") return <ChatNotice>{message.text}</ChatNotice>;
  const mine = message.author === "user";
  return (
    <ChatBubble
      prevCreatedAt={prev}
      mine={mine}
      text={message.text}
      createdAt={message.createdAt}
      name={mine ? undefined : "Voluntário"}
      showAvatar
      status={message.status}
      reply={
        replyToMessage
          ? { author: replyToMessage.author === "user" ? "Você" : "Voluntário", text: replyToMessage.text }
          : undefined
      }
      onReply={onReply}
      onRetry={onRetry}
    />
  );
}
