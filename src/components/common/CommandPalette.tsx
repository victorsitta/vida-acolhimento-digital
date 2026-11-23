import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileWarning, LogOut, MessagesSquare, Moon, Search, UserRound } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { chatService, reportService, userService } from "@/services";
import { useTheme } from "@/contexts/ThemeContext";
import { useProfile } from "@/contexts/ProfileContext";
import { Button } from "@/components/ui/button";

export interface PaletteNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

/** Busca global (Ctrl+K / ⌘K): telas, pessoas, conversas, denúncias e ações. */
export function CommandPalette({ items, onLogout }: { items: PaletteNavItem[]; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const { toggle } = useTheme();
  const { role } = useProfile();
  const staff = role === "moderador" || role === "administrador";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // dados da equipe só carregam quando a paleta abre
  const users = useQuery({ queryKey: ["palette-users"], queryFn: userService.list, enabled: open && staff, staleTime: 60_000 });
  const convs = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations, enabled: open && staff, staleTime: 60_000 });
  const reports = useQuery({ queryKey: ["palette-reports"], queryFn: reportService.list, enabled: open && staff, staleTime: 60_000 });

  const go = (to: string) => {
    setOpen(false);
    setTerm("");
    navigate({ to: to as never });
  };

  const q = term.trim().toLowerCase();
  const people = useMemo(
    () =>
      q.length < 2
        ? []
        : (users.data ?? [])
            .filter((u) => u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))
            .slice(0, 6),
    [users.data, q],
  );
  const chats = useMemo(
    () =>
      q.length < 2
        ? []
        : (convs.data ?? [])
            .filter((c) => !c.isTeamChat && ((c.userName ?? c.userAlias).toLowerCase().includes(q) || (c.volunteerAlias ?? "").toLowerCase().includes(q)))
            .slice(0, 5),
    [convs.data, q],
  );
  const reps = useMemo(
    () =>
      q.length < 2
        ? []
        : (reports.data ?? []).filter((r) => r.reason.toLowerCase().includes(q) || r.reportedAlias.toLowerCase().includes(q)).slice(0, 5),
    [reports.data, q],
  );

  const historyTo = role === "administrador" ? "/admin/historico" : "/mod/historico";
  const reportTo = (id: string) => `/mod/${id}`;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden h-9 gap-2 rounded-full pr-2 text-muted-foreground md:inline-flex"
        onClick={() => setOpen(true)}
        aria-label="Buscar (Ctrl K)"
      >
        <Search className="h-4 w-4" />
        <span className="text-xs">Buscar…</span>
        <kbd className="ml-4 rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium">Ctrl K</kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setTerm("");
        }}
      >
        <CommandInput
          value={term}
          onValueChange={setTerm}
          placeholder={staff ? "Buscar telas, pessoas, conversas, denúncias…" : "Para onde você quer ir?"}
        />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>

          <CommandGroup heading="Ir para">
            {items.map((i) => (
              <CommandItem key={i.to} value={`ir ${i.label}`} onSelect={() => go(i.to)}>
                <i.icon className="mr-2 h-4 w-4" /> {i.label}
              </CommandItem>
            ))}
          </CommandGroup>

          {staff && people.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Pessoas">
                {people.map((u) => (
                  <CommandItem key={u.id} value={`pessoa ${u.name} ${u.email ?? ""}`} onSelect={() => go("/admin/usuarios")}>
                    <UserRound className="mr-2 h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">{u.email}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {staff && chats.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Conversas">
                {chats.map((c) => (
                  <CommandItem key={c.id} value={`conversa ${c.userName ?? c.userAlias} ${c.volunteerAlias ?? ""} ${c.id}`} onSelect={() => go(historyTo)}>
                    <MessagesSquare className="mr-2 h-4 w-4" />
                    {(c.userName ?? c.userAlias)} ↔ {c.volunteerAlias ?? "sem voluntário"}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {staff && reps.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Denúncias">
                {reps.map((r) => (
                  <CommandItem key={r.id} value={`denuncia ${r.reason} ${r.reportedAlias} ${r.id}`} onSelect={() => go(reportTo(r.id))}>
                    <FileWarning className="mr-2 h-4 w-4" /> {r.reason}
                    <span className="ml-2 truncate text-xs text-muted-foreground">contra {r.reportedAlias}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="Ações">
            <CommandItem
              value="acao alternar tema claro escuro"
              onSelect={() => {
                toggle();
                setOpen(false);
              }}
            >
              <Moon className="mr-2 h-4 w-4" /> Alternar tema claro/escuro
            </CommandItem>
            <CommandItem
              value="acao sair logout"
              onSelect={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
