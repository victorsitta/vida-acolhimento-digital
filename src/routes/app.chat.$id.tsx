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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
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
  // avaliação do voluntário: aparece sempre que a conversa termina (por qualquer lado)
  const [rateOpen, setRateOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
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
      setRateOpen(true);
    }
  }, [conversation.data?.status]);

  const rate = useMutation({
    mutationFn: () => chatService.rate(id, stars, comment.trim() || undefined),
    onSuccess: () => {
      toast.success("Obrigado pela avaliação!");
      setRateOpen(false);
      navigate({ to: "/app/historico" });
    },
    onError: () => toast.error("Não foi possível enviar a avaliação."),
  });

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
      toast.success("Conversa encerrada.");
      setEndOpen(false);
      setRateOpen(true);
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
          onSticker: (st: string) => send.mutate({ text: st }),
          disabled: rateOpen || conversation.data?.status === "ended",
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

      <Dialog
        open={rateOpen}
        onOpenChange={(o) => {
          if (!o) {
            setRateOpen(false);
            navigate({ to: "/app/historico" });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Como foi seu atendimento?</DialogTitle>
            <DialogDescription>
              Sua avaliação ajuda a cuidar de quem cuida e a melhorar o acolhimento.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-1 py-2" role="group" aria-label="Nota de 1 a 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStars(n)}
                aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
                aria-pressed={stars === n}
                className="rounded-lg p-1 transition hover:scale-125"
              >
                <Star
                  className={`h-9 w-9 transition ${n <= stars ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
                />
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {["Toque para avaliar", "Precisa melhorar", "Poderia ser melhor", "Foi bom", "Muito bom", "Excelente!"][stars]}
          </p>
          <Textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Quer deixar um comentário? (opcional)"
            maxLength={500}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => {
                setRateOpen(false);
                navigate({ to: "/app/historico" });
              }}
            >
              Agora não
            </Button>
            <Button
              disabled={stars === 0 || rate.isPending}
              onClick={() => rate.mutate()}
            >
              {rate.isPending ? "Enviando…" : "Enviar avaliação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
