import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandHeart, Lock, Phone, Plus, ShieldHalf, Trash2 } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { HeroBanner } from "@/components/common/HeroBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { safetyPlanService, type SafetyContact, type SafetyPlan } from "@/services/features";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { fmtDateTime } from "@/utils/format";

export const Route = createFileRoute("/app/plano-seguranca")({
  head: () => ({ meta: [{ title: "Meu plano de segurança — VIDA+" }] }),
  component: Page,
});

const EMPTY: SafetyPlan = { warningSigns: "", coping: "", reasons: "", safePlace: "", contacts: [] };

const FIELDS: Array<{ key: keyof Omit<SafetyPlan, "contacts" | "updatedAt">; title: string; help: string; placeholder: string; rows: number }> = [
  { key: "warningSigns", title: "1. Meus sinais de alerta", help: "O que eu sinto, penso ou faço quando começo a ficar mal?", placeholder: "Ex.: não consigo dormir, me isolo, penso que sou um peso…", rows: 3 },
  { key: "coping", title: "2. O que me ajuda a me acalmar", help: "Coisas que posso fazer sozinho(a) para aliviar.", placeholder: "Ex.: respirar fundo, caminhar, ouvir uma música, tomar banho…", rows: 3 },
  { key: "safePlace", title: "3. Um lugar seguro", help: "Onde posso ir para me sentir protegido(a)?", placeholder: "Ex.: casa da minha irmã, a praça perto de casa…", rows: 2 },
  { key: "reasons", title: "4. Minhas razões para seguir", help: "Pessoas, sonhos ou coisas que importam para mim.", placeholder: "Ex.: minha filha, meu cachorro, terminar o curso…", rows: 3 },
];

function Page() {
  useAuthGuard();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["safety-plan"], queryFn: safetyPlanService.get, retry: false });
  const [plan, setPlan] = useState<SafetyPlan>(EMPTY);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.isSuccess) {
      setPlan(q.data ?? EMPTY);
      setDirty(false);
    }
  }, [q.isSuccess, q.data]);

  const save = useMutation({
    mutationFn: () => safetyPlanService.save({ ...plan, contacts: plan.contacts.filter((c) => c.name.trim() || c.phone.trim()) }),
    onSuccess: () => {
      toast.success("Plano de segurança salvo. Ele fica só com você 💛");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["safety-plan"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar."),
  });

  const set = (patch: Partial<SafetyPlan>) => {
    setPlan((p) => ({ ...p, ...patch }));
    setDirty(true);
  };
  const setContact = (i: number, patch: Partial<SafetyContact>) =>
    set({ contacts: plan.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <AppShell>
      <HeroBanner
        icon={ShieldHalf}
        eyebrow="Só você vê"
        title="Meu plano de segurança"
        description="Escreva com calma, num momento bom, o que fazer quando as coisas apertarem. Ele aparece no botão SOS quando você mais precisar."
      />

      {q.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <form
          className="max-w-3xl space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {FIELDS.map((f) => (
            <section key={f.key} className="rounded-xl border bg-card p-4 shadow-soft">
              <label htmlFor={f.key} className="font-display text-base font-semibold">
                {f.title}
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.help}</p>
              <Textarea id={f.key} rows={f.rows} className="mt-3" value={plan[f.key]} onChange={(e) => set({ [f.key]: e.target.value } as Partial<SafetyPlan>)} placeholder={f.placeholder} maxLength={2000} />
            </section>
          ))}

          <section className="rounded-xl border bg-card p-4 shadow-soft">
            <h2 className="font-display text-base font-semibold">5. Pessoas em quem eu confio</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Quem posso chamar quando precisar? Até 5 pessoas.</p>
            <ul className="mt-3 space-y-2">
              {plan.contacts.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Input className="min-w-0 flex-1 basis-40" placeholder="Nome" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} aria-label={`Nome do contato ${i + 1}`} />
                  <Input className="min-w-0 flex-1 basis-40" placeholder="Telefone" inputMode="tel" value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} aria-label={`Telefone do contato ${i + 1}`} />
                  {c.phone.trim() && (
                    <Button asChild variant="outline" size="icon" aria-label={`Ligar para ${c.name || "contato"}`}>
                      <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover contato" onClick={() => set({ contacts: plan.contacts.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            {plan.contacts.length < 5 && (
              <Button type="button" variant="outline" size="sm" className="mt-3 gap-2" onClick={() => set({ contacts: [...plan.contacts, { name: "", phone: "" }] })}>
                <Plus className="h-4 w-4" /> Adicionar pessoa
              </Button>
            )}
          </section>

          <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <HandHeart className="h-4 w-4 text-destructive" /> Se eu estiver em perigo agora
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Ligue para o CVV (188) ou para o SAMU (192). Ligações gratuitas.</p>
          </section>

          <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl border bg-card/95 p-3 shadow-lg backdrop-blur md:bottom-4">
            <Button type="submit" disabled={!dirty || save.isPending} className="gap-2">
              {save.isPending ? "Salvando…" : "Salvar meu plano"}
            </Button>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              {plan.updatedAt ? `Atualizado em ${fmtDateTime(plan.updatedAt)}` : "Privado: só você lê"}
            </span>
          </div>
        </form>
      )}
    </AppShell>
  );
}
