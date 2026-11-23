import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { FileWarning, LogOut, MessagesSquare, Moon, Search, UserRound, X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
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

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

/**
 * Busca global. No computador é um campo de digitar fixo no topo (Ctrl+K foca nele) com os
 * resultados logo abaixo. No celular é um ícone que abre a busca em tela cheia.
 */
export function CommandPalette({ items, onLogout }: { items: PaletteNavItem[]; onLogout: () => void }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false); // painel de resultados (desktop) / tela cheia (celular)
  const [mobile, setMobile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toggle } = useTheme();
  const { role } = useProfile();
  const staff = role === "moderador" || role === "administrador";

  // Ctrl+K: foca no campo (desktop) ou abre a tela cheia (celular)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isDesktop()) {
          inputRef.current?.focus();
          setOpen(true);
        } else {
          setMobile(true);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // fecha o painel ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = open || mobile;
  const users = useQuery({ queryKey: ["palette-users"], queryFn: userService.list, enabled: active && staff, staleTime: 60_000 });
  const convs = useQuery({ queryKey: ["conversations"], queryFn: chatService.getConversations, enabled: active && staff, staleTime: 60_000 });
  const reports = useQuery({ queryKey: ["palette-reports"], queryFn: reportService.list, enabled: active && staff, staleTime: 60_000 });

  const done = () => {
    setOpen(false);
    setMobile(false);
    setTerm("");
    inputRef.current?.blur();
  };
  const go = (to: string) => {
    done();
    navigate({ to: to as never });
  };

  const q = term.trim().toLowerCase();
  const people = useMemo(
    () => (q.length < 2 ? [] : (users.data ?? []).filter((u) => u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q)).slice(0, 6)),
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
    () => (q.length < 2 ? [] : (reports.data ?? []).filter((r) => r.reason.toLowerCase().includes(q) || r.reportedAlias.toLowerCase().includes(q)).slice(0, 5)),
    [reports.data, q],
  );
  const historyTo = role === "administrador" ? "/admin/historico" : "/mod/historico";

  const body = (
    <CommandList className="max-h-[min(26rem,60dvh)]">
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
                <span className="ml-2 hidden truncate text-xs text-muted-foreground sm:inline">{u.email}</span>
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
                <MessagesSquare className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">
                  {c.userName ?? c.userAlias} ↔ {c.volunteerAlias ?? "sem voluntário"}
                </span>
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
              <CommandItem key={r.id} value={`denuncia ${r.reason} ${r.reportedAlias} ${r.id}`} onSelect={() => go(`/mod/${r.id}`)}>
                <FileWarning className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{r.reason}</span>
                <span className="ml-2 hidden truncate text-xs text-muted-foreground sm:inline">contra {r.reportedAlias}</span>
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
            done();
          }}
        >
          <Moon className="mr-2 h-4 w-4" /> Alternar tema claro/escuro
        </CommandItem>
        <CommandItem
          value="acao sair logout"
          onSelect={() => {
            done();
            onLogout();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </CommandItem>
      </CommandGroup>
    </CommandList>
  );

  const placeholder = staff ? "Buscar telas, pessoas, conversas, denúncias…" : "Buscar telas e ações…";

  return (
    <>
      {/* PC e tablet: campo de digitar direto no topo */}
      <div ref={boxRef} className="relative hidden w-full max-w-2xl md:block">
        <Command className="overflow-visible bg-transparent [&_[cmdk-group-heading]]:px-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={term}
              onValueChange={(v) => {
                setTerm(v);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") done();
              }}
              placeholder={placeholder}
              aria-label="Buscar no VIDA+"
              className="h-10 w-full rounded-full border border-input bg-background/70 pl-10 pr-20 text-sm outline-none transition-all placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/15"
            />
            {term ? (
              <button type="button" onClick={() => setTerm("")} aria-label="Limpar busca" className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground">Ctrl K</kbd>
            )}
          </div>
          {open && (
            <div className="pop-in absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl">{body}</div>
          )}
        </Command>
      </div>

      {/* Celular: ícone que abre a busca em tela cheia */}
      <Button variant="ghost" size="icon" className="h-11 w-11 md:hidden" onClick={() => setMobile(true)} aria-label="Buscar">
        <Search className="h-5 w-5" />
      </Button>

      {mobile && (
        <div className="fixed inset-0 z-[300] flex flex-col bg-background md:hidden" role="dialog" aria-modal="true" aria-label="Buscar">
          <Command className="flex h-full flex-col rounded-none bg-background">
            <div className="flex items-center gap-2 border-b p-3 safe-top">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <CommandPrimitive.Input
                  autoFocus
                  value={term}
                  onValueChange={setTerm}
                  placeholder={placeholder}
                  aria-label="Buscar no VIDA+"
                  className="h-11 w-full rounded-full border border-input bg-background pl-10 pr-4 text-base outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={done}>
                Cancelar
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto [&_[cmdk-list]]:max-h-none">{body}</div>
          </Command>
        </div>
      )}
    </>
  );
}
