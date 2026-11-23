import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarDays, HeartPulse, MessagesSquare, Smile, UsersRound, Mail } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/common/IconInput";
import { chatService, communityService, userService, wellbeingService } from "@/services";
import { profileSchema } from "@/utils/validators";
import { Field } from "./login";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { fmtDate } from "@/utils/format";

type V = z.infer<typeof profileSchema>;

export const Route = createFileRoute("/app/perfil")({
  head: () => ({ meta: [{ title: "Perfil — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: userService.me });
  const convs = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations, retry: false });
  const groups = useQuery({ queryKey: ["communities"], queryFn: communityService.list, retry: false });
  const mood = useQuery({ queryKey: ["mood"], queryFn: wellbeingService.list, retry: false });

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<V>({
    resolver: zodResolver(profileSchema),
    values: me.data ? { name: me.data.nickname, email: me.data.email } : undefined,
  });

  const update = useMutation({
    mutationFn: (v: V) => userService.updateNickname(v.name),
    onSuccess: () => {
      toast.success("Perfil atualizado.");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível atualizar o perfil."),
  });

  const u = me.data;
  return (
    <AppShell>
      <section className="hero relative mb-6 overflow-hidden rounded-2xl border p-5 shadow-soft sm:p-6">
        <span className="blob blob-a" aria-hidden="true" />
        <span className="blob blob-b" aria-hidden="true" />
        <div className="relative z-10 flex flex-wrap items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent font-display text-2xl font-semibold text-primary-foreground shadow-glow">
            {u?.initials ?? "··"}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold">{u?.nickname ?? "Seu perfil"}</h1>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" /> {u?.email}
            </p>
            {u?.joinedAt && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> Com o VIDA+ desde {fmtDate(u.joinedAt)}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Conversas" icon={MessagesSquare} tone="primary" value={String((convs.data ?? []).filter((c) => !c.isTeamChat).length)} />
        <StatCard label="Grupos" icon={UsersRound} tone="info" value={String((groups.data ?? []).filter((g) => g.joined).length)} />
        <StatCard label="Check-ins" icon={HeartPulse} tone="success" value={String((mood.data ?? []).length)} />
        <StatCard
          label="Humor médio"
          icon={Smile}
          tone="accent"
          value={(mood.data ?? []).length ? ((mood.data ?? []).reduce((a, b) => a + b.mood, 0) / (mood.data ?? []).length).toFixed(1).replace(".", ",") : "—"}
          hint="De 1 a 5"
        />
      </div>

      <form onSubmit={handleSubmit((v) => update.mutate(v))} className="max-w-xl space-y-4 rounded-xl border bg-card p-4 shadow-soft sm:p-5" noValidate>
        <h2 className="font-display text-base font-semibold">Seus dados</h2>
        <Field label="Apelido público" id="name" error={errors.name?.message}>
          <IconInput id="name" icon={Smile} aria-invalid={!!errors.name} {...register("name")} />
          <p className="mt-1 text-xs text-muted-foreground">
            Este apelido aparece nos grupos. Seu nome completo permanece privado.
          </p>
        </Field>
        <Field label="E-mail" id="email" error={errors.email?.message}>
          <IconInput id="email" icon={Mail} type="email" {...register("email")} disabled />
        </Field>
        <Button type="submit" disabled={update.isPending || !isDirty}>
          {update.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </form>
    </AppShell>
  );
}
