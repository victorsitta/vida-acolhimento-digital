import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pager, usePagination } from "@/components/common/Pager";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { TranscriptDialog } from "@/components/chat/TranscriptDialog";
import { logAudit } from "@/services/audit";
import {
  Mail,
  MessageCircle,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/layouts/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/common/PageHeader";
import { adminCommunityService } from "@/services";
import { fmtDateTime, fmtRelative } from "@/utils/format";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/admin/comunidades/$id")({
  head: () => ({ meta: [{ title: "Controle do grupo — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [feedOpen, setFeedOpen] = useState(false);
  const group = useQuery({
    queryKey: ["admin-community", id],
    queryFn: () => adminCommunityService.get(id),
    refetchInterval: 5000,
  });
  const pgMembers = usePagination(group.data?.members ?? [], 10);

  const member = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: "ativo" | "removido" }) =>
      adminCommunityService.updateMember(id, userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-community", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-communities"] });
      toast.success("Participante atualizado. A ação foi registrada.");
    },
  });
  const update = useMutation({
    mutationFn: () =>
      adminCommunityService.update(id, {
        name: name.trim(),
        description: description.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-community", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-communities"] });
      setEditing(false);
      toast.success("Dados do grupo atualizados.");
    },
  });
  const removeMessage = useMutation({
    mutationFn: (messageId: string) => adminCommunityService.deleteMessage(id, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-community", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-communities"] });
      toast.success("Mensagem removida e ação registrada.");
    },
  });

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
      <PageHeader
        title={group.data.name}
        description={`${group.data.memberCount} participantes · ${group.data.messageCount} mensagens · status ${group.data.status}`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                setName(group.data.name);
                setDescription(group.data.description);
                setEditing((value) => !value);
              }}
            >
              <Pencil className="h-4 w-4" /> Editar
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/comunidades">Voltar</Link>
            </Button>
          </div>
        }
      />

      {editing && (
        <section className="mb-6 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Editar grupo</h2>
          <div className="mt-3 grid gap-3">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <Button
                disabled={name.trim().length < 3 || update.isPending}
                onClick={() => update.mutate()}
              >
                Salvar alterações
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Esta área mostra identidades reais por ser administrativa. Visualizações e alterações
            sensíveis são registradas na auditoria.
          </p>
        </div>
      </section>

      <div className="grid gap-8">
        <section>
          <h2 className="font-display text-xl font-semibold">Participantes</h2>
          <div className="mt-3 overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Pessoa</th>
                  <th className="px-4 py-3">Apelido no grupo</th>
                  <th className="px-4 py-3">Atividade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pgMembers.pageItems.map((item) => (
                  <tr key={item.userId}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> {item.email}
                      </p>
                    </td>
                    <td className="px-4 py-3">{item.alias}</td>
                    <td className="px-4 py-3">
                      <p>{item.messageCount} mensagens</p>
                      <p className="text-xs text-muted-foreground">
                        Entrou {fmtRelative(item.joinedAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3 capitalize">{item.status}</td>
                    <td className="px-4 py-3">
                      {item.status === "ativo" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => member.mutate({ userId: item.userId, status: "removido" })}
                        >
                          <UserRoundX className="mr-1.5 h-4 w-4" /> Remover
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => member.mutate({ userId: item.userId, status: "ativo" })}
                        >
                          <UserRoundCheck className="mr-1.5 h-4 w-4" /> Restaurar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...pgMembers} onPageChange={pgMembers.setPage} />
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">Conversa do grupo</h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-soft">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {group.data.messages.length} mensagens ·{" "}
                {group.data.members.filter((m) => m.status === "ativo").length} participantes
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {group.data.messages.length
                  ? `Última: ${group.data.messages[group.data.messages.length - 1].alias}, ${fmtDateTime(group.data.messages[group.data.messages.length - 1].createdAt)}`
                  : "Ainda sem mensagens."}
              </p>
            </div>
            <Button
              className="gap-2"
              onClick={() => {
                setFeedOpen(true);
                void logAudit("grupo.conversa_lida", "grupo", id, { mensagens: group.data?.messages.length ?? 0 }, 5 * 60_000);
              }}
            >
              <MessageCircle className="h-4 w-4" /> Abrir conversa
            </Button>
          </div>
        </section>

        <TranscriptDialog
          open={feedOpen}
          onOpenChange={setFeedOpen}
          title={group.data.name}
          subtitle="Atualiza sozinha. Você pode remover mensagens inadequadas."
          scrollKey={group.data.messages.length}
        >
          <div className="space-y-3 px-3 sm:px-5" aria-live="polite">
            {group.data.messages.map((message) => (
              <ChatBubble
                key={message.id}
                mine={false}
                text={message.text}
                createdAt={message.createdAt}
                name={message.alias}
                showAvatar
                footer={
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Remover esta mensagem do grupo?")) removeMessage.mutate(message.id);
                    }}
                    disabled={removeMessage.isPending}
                    className="mt-1 inline-flex cursor-pointer items-center gap-1 px-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" /> Remover
                  </button>
                }
              />
            ))}
            {group.data.messages.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma mensagem neste grupo ainda.
              </p>
            )}
          </div>
        </TranscriptDialog>
      </div>
    </AppShell>
  );
}
