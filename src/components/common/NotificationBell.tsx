import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CheckCheck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notificationService, type Notification } from "@/services";
import { supabase } from "@/lib/supabase";
import { fmtRelative } from "@/utils/format";
import { cn } from "@/lib/utils";

/** Sino de notificações com contador, lista e aviso do navegador para novidades. */
export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const seen = useRef<Set<string> | null>(null);

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationService.list,
    refetchInterval: 30_000,
    retry: false,
  });
  const list = q.data ?? [];
  const unread = list.filter((n) => !n.readAt).length;

  // tempo real: nova notificação chega sem recarregar
  useEffect(() => {
    const uid = typeof window !== "undefined" ? window.localStorage.getItem("vidaplus:user_id") : null;
    if (!supabase || !uid) return;
    const ch = supabase
      .channel(`notifications:${uid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      supabase?.removeChannel(ch);
    };
  }, [qc]);

  // aviso do navegador só para o que for novo depois da primeira carga
  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(q.data.map((n) => n.id));
    if (seen.current) {
      for (const n of q.data) {
        if (!seen.current.has(n.id) && !n.readAt && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(n.title, { body: n.body, icon: "/favicon.ico", tag: n.id });
          } catch {
            /* alguns navegadores móveis não permitem */
          }
        }
      }
    }
    seen.current = ids;
  }, [q.data]);

  const read = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readAll = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const open = (n: Notification) => {
    if (!n.readAt) read.mutate(n.id);
    if (n.link) navigate({ to: n.link as never });
  };

  const canAsk = typeof window !== "undefined" && "Notification" in window && Notification.permission === "default";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-11 w-11" aria-label={unread ? `Notificações: ${unread} não lidas` : "Notificações"}>
          {unread > 0 ? <BellRing className="h-5 w-5 text-primary" /> : <Bell className="h-5 w-5" />}
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl p-0 shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notificações</p>
            <p className="text-xs text-muted-foreground">{unread ? `${unread} não lida${unread > 1 ? "s" : ""}` : "Tudo em dia"}</p>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" disabled={!unread || readAll.isPending} onClick={() => readAll.mutate()}>
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
          </Button>
        </div>

        <div className="max-h-[60dvh] overflow-y-auto">
          {list.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="float-y grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-8 ring-primary/5">
                <Inbox className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-medium">Nenhuma notificação</p>
              <p className="text-xs text-muted-foreground">Avisos sobre atendimentos, denúncias e candidaturas aparecem aqui.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {list.slice(0, 30).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className={cn("row-hover flex w-full items-start gap-3 px-4 py-3 text-left", !n.readAt && "bg-primary/5")}
                  >
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug">{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-muted-foreground">{fmtRelative(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canAsk && (
          <div className="border-t p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => Notification.requestPermission().then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))}
            >
              <BellRing className="h-4 w-4" /> Ativar avisos no navegador
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
