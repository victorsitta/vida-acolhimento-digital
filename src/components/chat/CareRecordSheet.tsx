import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  PlusCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { careRecordService, MAX_ATTACHMENT_MB, MAX_ATTACHMENTS } from "@/services/careRecordService";
import { fmtDateTime } from "@/utils/format";
import { cn } from "@/lib/utils";
import type { CareAttachment, CareRecord } from "@/types";

type Risk = "baixo" | "medio" | "alto" | "imediato";

const RISKS: Array<{ value: Risk; label: string; dot: string; chip: string; border: string }> = [
  { value: "baixo", label: "Baixo", dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", border: "border-l-emerald-500" },
  { value: "medio", label: "Médio", dot: "bg-yellow-500", chip: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300", border: "border-l-yellow-500" },
  { value: "alto", label: "Alto", dot: "bg-orange-500", chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300", border: "border-l-orange-500" },
  { value: "imediato", label: "Imediato", dot: "bg-red-500", chip: "bg-red-500/15 text-red-700 dark:text-red-300", border: "border-l-red-500" },
];
const riskOf = (v: string) => RISKS.find((r) => r.value === v) ?? RISKS[0];

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return ImageIcon;
  if (type === "application/pdf" || type.includes("word") || type.startsWith("text/")) return FileText;
  return FileIcon;
}

function AttachmentChip({ file }: { file: CareAttachment }) {
  const [busy, setBusy] = useState(false);
  const Icon = fileIcon(file.type);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          window.open(await careRecordService.getAttachmentUrl(file.path), "_blank", "noopener");
        } catch (e: any) {
          toast.error(e?.message || "Não foi possível abrir o anexo.");
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-left text-xs transition hover:border-primary/50 hover:bg-muted disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Icon className="h-4 w-4 shrink-0 text-primary" />}
      <span className="min-w-0 truncate">{file.name}</span>
      <span className="shrink-0 text-muted-foreground">{fmtSize(file.size)}</span>
    </button>
  );
}

function RecordCard({ rec }: { rec: CareRecord }) {
  const [open, setOpen] = useState(false);
  const risk = riskOf(rec.riskLevel);
  const long = rec.summary.length > 280;
  return (
    <article className={cn("rounded-xl border border-l-4 bg-card p-4 shadow-sm", risk.border)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {rec.title && <h4 className="text-sm font-semibold leading-snug">{rec.title}</h4>}
          <p className="text-xs text-muted-foreground">
            {fmtDateTime(rec.createdAt)} · {rec.volunteerName || "Voluntário"}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", risk.chip)}>
          Risco {risk.label.toLowerCase()}
        </span>
      </header>

      <p
        className={cn(
          "mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed",
          long && !open && "line-clamp-5",
        )}
      >
        {rec.summary}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {open ? (
            <>
              Mostrar menos <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Ler tudo <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      )}

      {rec.actionTaken && (
        <div className="mt-3 rounded-lg bg-muted/70 p-3 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Conduta
          </span>
          <p className="mt-0.5 whitespace-pre-wrap break-words">{rec.actionTaken}</p>
        </div>
      )}

      {!!rec.attachments?.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {rec.attachments.map((f) => (
            <AttachmentChip key={f.path} file={f} />
          ))}
        </div>
      )}
    </article>
  );
}

interface CareRecordSheetProps {
  userId?: string;
  userAlias?: string;
  conversationId?: string;
  /** "dark" para uso sobre fundos escuros fixos (cabeçalho do chat do voluntário). */
  tone?: "theme" | "dark";
}

export function CareRecordSheet({
  userId,
  userAlias = "Pessoa acolhida",
  conversationId,
  tone = "theme",
}: CareRecordSheetProps) {
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [riskLevel, setRiskLevel] = useState<Risk>("baixo");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const history = useQuery({
    queryKey: ["care-records", userId],
    queryFn: () => careRecordService.getPatientHistory(userId!),
    enabled: !!userId && open,
  });
  const records = history.data ?? [];
  const highest = records.reduce<Risk | null>((acc, r) => {
    const order = ["baixo", "medio", "alto", "imediato"];
    return !acc || order.indexOf(r.riskLevel) > order.indexOf(acc) ? r.riskLevel : acc;
  }, null);

  const reset = () => {
    setTitle("");
    setSummary("");
    setActionTaken("");
    setRiskLevel("baixo");
    setFiles([]);
    setShowAdd(false);
  };

  const add = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("Pessoa não identificada.");
      return careRecordService.addRecord({
        userId,
        conversationId,
        riskLevel,
        title,
        summary: summary.trim(),
        actionTaken: actionTaken.trim() || undefined,
        files,
      });
    },
    onSuccess: () => {
      toast.success("Registro salvo no prontuário.");
      reset();
      qc.invalidateQueries({ queryKey: ["care-records", userId] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar o registro."),
  });

  const pick = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        toast.error(`"${f.name}" passa de ${MAX_ATTACHMENT_MB} MB.`);
        continue;
      }
      if (next.length >= MAX_ATTACHMENTS) {
        toast.error(`Máximo de ${MAX_ATTACHMENTS} anexos por registro.`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors",
            tone === "dark"
              ? "text-amber-400/90 hover:bg-white/10 hover:text-amber-300"
              : "border bg-card text-foreground hover:border-primary/50 hover:bg-muted",
          )}
          title="Abrir prontuário"
        >
          <ClipboardList className="h-4 w-4" />
          <span className={tone === "dark" ? "hidden sm:inline" : ""}>Prontuário</span>
        </button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="space-y-1 border-b bg-gradient-to-b from-primary/10 to-transparent px-4 pb-4 pt-6 text-left sm:px-6">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-primary" />
            Prontuário · {userAlias}
          </SheetTitle>
          <SheetDescription className="flex items-start gap-1.5 text-xs">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Confidencial: visível somente à equipe de atendimento.
          </SheetDescription>
          {records.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 text-xs">
              <span className="rounded-full bg-muted px-2.5 py-1">
                {records.length} registro{records.length > 1 ? "s" : ""}
              </span>
              {highest && (
                <span className={cn("rounded-full px-2.5 py-1 font-medium", riskOf(highest).chip)}>
                  Maior risco: {riskOf(highest).label.toLowerCase()}
                </span>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {!showAdd ? (
            <Button onClick={() => setShowAdd(true)} className="w-full gap-2" size="lg">
              <PlusCircle className="h-4 w-4" /> Novo registro
            </Button>
          ) : (
            <form
              className="space-y-4 rounded-xl border bg-card p-4 shadow-sm"
              onSubmit={(e) => {
                e.preventDefault();
                if (summary.trim() && !add.isPending) add.mutate();
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Novo registro</h3>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Cancelar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cr-title" className="text-xs font-medium text-muted-foreground">
                  Título (opcional)
                </label>
                <Input
                  id="cr-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Primeira escuta, retorno após crise…"
                  maxLength={120}
                />
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium text-muted-foreground">Nível de risco</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {RISKS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRiskLevel(r.value)}
                      aria-pressed={riskLevel === r.value}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition",
                        riskLevel === r.value
                          ? "border-primary bg-primary/15 text-foreground ring-1 ring-primary"
                          : "hover:bg-muted",
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", r.dot)} />
                      {r.label}
                    </button>
                  ))}
                </div>
                {riskLevel === "imediato" && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> Considere acionar CVV 188 / SAMU 192.
                  </p>
                )}
              </fieldset>

              <div className="space-y-1.5">
                <label htmlFor="cr-summary" className="text-xs font-medium text-muted-foreground">
                  Relato livre
                </label>
                <Textarea
                  id="cr-summary"
                  rows={7}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Escreva livremente: o que a pessoa trouxe, como estava emocionalmente, pontos de atenção, evolução desde o último contato…"
                  className="min-h-[9rem] resize-y leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="cr-action" className="text-xs font-medium text-muted-foreground">
                  Conduta e orientações (opcional)
                </label>
                <Textarea
                  id="cr-action"
                  rows={3}
                  value={actionTaken}
                  onChange={(e) => setActionTaken(e.target.value)}
                  placeholder="Encaminhamentos, técnicas oferecidas, combinados para o próximo contato…"
                  className="resize-y"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Anexos ({files.length}/{MAX_ATTACHMENTS})
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileRef.current?.click()}
                    disabled={files.length >= MAX_ATTACHMENTS}
                  >
                    <Paperclip className="h-4 w-4" /> Anexar arquivo
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    hidden
                    accept="image/*,application/pdf,.doc,.docx,.txt,.odt,.xls,.xlsx"
                    onChange={(e) => pick(e.target.files)}
                  />
                </div>
                {files.length > 0 && (
                  <ul className="space-y-1.5">
                    {files.map((f, i) => {
                      const Icon = fileIcon(f.type);
                      return (
                        <li
                          key={`${f.name}-${i}`}
                          className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate">{f.name}</span>
                          <span className="shrink-0 text-muted-foreground">{fmtSize(f.size)}</span>
                          <button
                            type="button"
                            onClick={() => setFiles(files.filter((_, j) => j !== i))}
                            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                            aria-label={`Remover ${f.name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Imagens, PDF e documentos · até {MAX_ATTACHMENT_MB} MB cada. Guardados em área privada.
                </p>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={reset}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!summary.trim() || add.isPending} className="gap-2">
                  {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {add.isPending ? "Salvando…" : "Salvar no prontuário"}
                </Button>
              </div>
            </form>
          )}

          <section className="space-y-3" aria-label="Histórico de acolhimentos">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Histórico de acolhimentos
            </h3>
            {history.isPending ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : history.isError ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                Não foi possível carregar o prontuário. Rode o SQL de prontuário no Supabase e tente de novo.
              </p>
            ) : records.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center">
                <ClipboardList className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Nenhum registro ainda</p>
                <p className="text-xs text-muted-foreground">
                  O primeiro registro aparece aqui, do mais recente para o mais antigo.
                </p>
              </div>
            ) : (
              records.map((r) => <RecordCard key={r.id} rec={r} />)
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
