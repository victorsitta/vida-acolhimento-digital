import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Flag, LogOut, Send, ShieldCheck, UsersRound, Wifi } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/layouts/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { communityService, reportService, queueService } from "@/services";
import { fmtRelative } from "@/utils/format";
import { cn } from "@/lib/utils";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useCommunityRealtime } from "@/hooks/useCommunityRealtime";
import { ChatBubble, TypingDots } from "@/components/chat/ChatBubble";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { useProfile } from "@/contexts/ProfileContext";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/app/comunidades/$id")({
  head: () => ({ meta: [{ title: "Grupo de apoio — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const group = useQuery({ queryKey: ["community", id], queryFn: () => communityService.get(id) });
  const messages = useQuery({
    queryKey: ["community-messages", id],
    queryFn: () => communityService.getMessages(id),
    refetchInterval: 4000,
  });

  // Conexão tempo real para mensagens, presenças e digitação
  const { onlineUsers, onlineCount, typingText, isTyping } = useCommunityRealtime(
    id,
    group.data?.myAlias,
    !!group.data?.joined
  );

  // Scroll automático ao receber novas mensagens
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data?.length]);

  const send = useMutation({
    mutationFn: (message: string) => communityService.sendMessage(id, message),
    onSuccess: () => {
      setText("");
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      communityService.sendTyping(id, false, group.data?.myAlias);
      queryClient.invalidateQueries({ queryKey: ["community-messages", id] });
    },
    onError: (error) => toast.error(error.message),
  });

  const leave = useMutation({
    mutationFn: () => communityService.leave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
      toast("Você saiu do grupo.");
      navigate({ to: "/app/comunidades" });
    },
  });

  const reportMessage = useMutation({
    mutationFn: ({ messageId, alias }: { messageId: string; alias: string }) =>
      reportService.createFromMessage(messageId, alias),
    onSuccess: () => toast.success("Mensagem denunciada. A moderação fará a análise."),
    onError: (error) => toast.error(error.message),
  });

  const { role } = useProfile();
  const [targetMsg, setTargetMsg] = useState<any | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const referUserMutation = useMutation({
    mutationFn: (targetUserId: string) => queueService.referUser(targetUserId),
    onSuccess: () => toast.success("Usuário encaminhado para acolhimento na fila com sucesso."),
    onError: (error) => toast.error(error.message),
  });

  const reportUserMutation = useMutation({
    mutationFn: () => {
      if (!targetMsg || !targetMsg.senderId) throw new Error("Usuário não identificado");
      return reportService.create({
        reportedAlias: targetMsg.senderId,
        reason: reportReason,
        details: reportDetails,
      });
    },
    onSuccess: () => {
      toast.success("Denúncia de usuário enviada com sucesso.");
      setReportModalOpen(false);
      setReportReason("");
      setReportDetails("");
      setTargetMsg(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    if (val.trim() && group.data?.joined) {
      communityService.sendTyping(id, true, group.data.myAlias);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        communityService.sendTyping(id, false, group.data?.myAlias);
      }, 2500);
    } else if (!val.trim()) {
      communityService.sendTyping(id, false, group.data?.myAlias);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (message) send.mutate(message);
  };

  if (group.isPending)
    return (
      <AppShell>
        <p>Carregando...</p>
      </AppShell>
    );
  if (!group.data)
    return (
      <AppShell>
        <p>Grupo não encontrado.</p>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ChatRoom
          className="h-[calc(100dvh-13rem)]"
          title={group.data.name}
          avatarText={group.data.name}
          back={
            <Link to="/app/comunidades" className="hover:underline">
              ← Todos os grupos
            </Link>
          }
          subtitle={
            <>
              {group.data.memberCount} participantes · {onlineCount || 1} online · você é{" "}
              <strong className="text-foreground">{group.data.myAlias}</strong>
            </>
          }
          onEnd={() => leave.mutate()}
          endLabel="Sair do grupo"
          scrollKey={(messages.data ?? []).length}
          typing={
            isTyping ? (
              <div className="mb-2">
                <TypingDots label={typingText} />
              </div>
            ) : undefined
          }
          composer={{
            value: text,
            onChange: handleTextChange,
            onSubmit: () => {
              const message = text.trim();
              if (message) send.mutate(message);
            },
            sending: send.isPending,
            onSticker: (st: string) => send.mutate(st),
            disabled: !group.data.joined,
            placeholder: `Escreva como ${group.data.myAlias}...`,
            hint: "Não compartilhe nome, telefone, endereço ou redes sociais.",
          }}
        >
            {(messages.data ?? []).map((message, idx, arr) => (
              <ChatBubble
                key={message.id}
                prevCreatedAt={arr[idx - 1]?.createdAt}
                mine={!!message.isMine}
                text={message.text}
                createdAt={message.createdAt}
                name={message.alias}
                showAvatar
                footer={
                  !message.isMine ? (
                    <div className="mt-1 flex flex-wrap items-center gap-3 px-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Denunciar esta mensagem para a moderação?")) {
                            reportMessage.mutate({ messageId: message.id, alias: message.alias });
                          }
                        }}
                        disabled={reportMessage.isPending}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Flag className="h-3 w-3" /> Denunciar
                      </button>
                      {["moderador", "administrador"].includes(role) && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetMsg(message);
                              setReportModalOpen(true);
                            }}
                            className="cursor-pointer text-xs text-primary hover:underline"
                          >
                            Denunciar usuário
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                message.senderId &&
                                window.confirm(
                                  `Encaminhar o usuário "${message.alias}" para atendimento com voluntário?`,
                                )
                              ) {
                                referUserMutation.mutate(message.senderId);
                              }
                            }}
                            disabled={referUserMutation.isPending}
                            className="cursor-pointer text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            Solicitar acolhimento
                          </button>
                        </>
                      )}
                    </div>
                  ) : undefined
                }
              />
            ))}
            {!messages.isPending && (messages.data?.length ?? 0) === 0 && (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Ainda não há mensagens. Você pode começar com um oi.
              </p>
            )}
        </ChatRoom>

        <aside className="space-y-4">
          <section className="rounded-2xl border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Online agora ({onlineCount || 1})
              </h2>
            </div>
            <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
              {onlineUsers.length > 0 ? (
                onlineUsers.map((u) => (
                  <div key={u.userId} className="flex items-center gap-2 text-xs">
                    <div className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-[10px] font-medium text-primary">
                      {u.alias.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="truncate font-medium text-foreground">
                      {u.alias}
                      {u.alias === group.data?.myAlias && (
                        <span className="ml-1 text-[10px] text-muted-foreground">(você)</span>
                      )}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-[10px] font-medium text-primary">
                    {(group.data?.myAlias || "EU").slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-medium text-foreground">{group.data?.myAlias || "Você"}</span>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="mt-2 text-sm font-semibold">Como sua identidade é protegida</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              O grupo vê somente seu apelido. Moderadores não consultam identidades livremente: isso
              ocorre apenas em denúncia ou risco, com justificativa e registro de auditoria.
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Combinados do grupo</h2>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {group.data.rules.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {/* Dialog para denúncia de usuário (Moderadores/Admins) */}
      <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Denunciar Usuário</DialogTitle>
            <DialogDescription>
              Abra uma denúncia formal contra o comportamento do usuário "{targetMsg?.alias}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Motivo</label>
              <Input
                placeholder="Ex: Ofensa, Assédio, Compartilhamento de dados..."
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Detalhes da Denúncia</label>
              <Textarea
                placeholder="Descreva o comportamento observado..."
                rows={4}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReportModalOpen(false);
                setTargetMsg(null);
                setReportReason("");
                setReportDetails("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => reportUserMutation.mutate()}
              disabled={!reportReason.trim() || !reportDetails.trim() || reportUserMutation.isPending}
            >
              {reportUserMutation.isPending ? "Enviando..." : "Enviar Denúncia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
