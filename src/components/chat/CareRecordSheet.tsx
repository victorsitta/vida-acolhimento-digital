import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { careRecordService } from "@/services/careRecordService";
import { fmtDateTime } from "@/utils/format";
import { ClipboardList, PlusCircle, AlertCircle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface CareRecordSheetProps {
  userId?: string;
  userAlias?: string;
  conversationId?: string;
}

export function CareRecordSheet({ userId, userAlias = "Pessoa Acolhida", conversationId }: CareRecordSheetProps) {
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [summary, setSummary] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [riskLevel, setRiskLevel] = useState<"baixo" | "medio" | "alto" | "imediato">("baixo");

  const qc = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["care-records", userId],
    queryFn: () => (userId ? careRecordService.getPatientHistory(userId) : Promise.resolve([])),
    enabled: !!userId && open,
  });

  const addMutation = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("Usuário não identificado");
      return careRecordService.addRecord({
        userId,
        conversationId,
        riskLevel,
        summary,
        actionTaken: actionTaken.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Nota de evolução adicionada ao prontuário.");
      setSummary("");
      setActionTaken("");
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["care-records", userId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Não foi possível registrar no prontuário.");
    },
  });

  const riskBadge = (level: string) => {
    switch (level) {
      case "imediato":
        return <Badge variant="destructive" className="bg-red-600 text-white">Risco Imediato</Badge>;
      case "alto":
        return <Badge variant="destructive" className="bg-amber-600 text-white">Risco Alto</Badge>;
      case "medio":
        return <Badge className="bg-yellow-500 text-black">Risco Médio</Badge>;
      default:
        return <Badge variant="secondary">Risco Baixo</Badge>;
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-amber-400/90 transition-colors hover:bg-white/10 hover:text-amber-300"
          title="Abrir Prontuário do Acolhido"
        >
          <ClipboardList className="h-4 w-4" />
          <span className="hidden sm:inline">Prontuário</span>
        </button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col sm:max-w-md" style={{ background: "hsl(30 15% 10%)", color: "white" }}>
        <SheetHeader className="border-b border-white/10 pb-4 text-left">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-bold text-white flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-400" />
              Prontuário do Acolhido
            </SheetTitle>
          </div>
          <SheetDescription className="text-white/60 text-xs">
            Registro confidencial e histórico de evoluções para {userAlias}. Visível apenas para a equipe de atendimento.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Botão de Nova Nota */}
          {!showAdd ? (
            <Button
              onClick={() => setShowAdd(true)}
              variant="outline"
              size="sm"
              className="w-full border-dashed border-white/20 bg-white/5 text-amber-300 hover:bg-white/10"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Adicionar Nota de Evolução
            </Button>
          ) : (
            <div className="rounded-xl border border-white/15 bg-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Nova anotação clínica / acolhimento</span>
                <select
                  value={riskLevel}
                  onChange={(e: any) => setRiskLevel(e.target.value)}
                  className="rounded bg-black/40 text-xs text-white border border-white/20 px-2 py-1"
                >
                  <option value="baixo">Risco Baixo</option>
                  <option value="medio">Risco Médio</option>
                  <option value="alto">Risco Alto</option>
                  <option value="imediato">Risco Imediato</option>
                </select>
              </div>

              <Textarea
                rows={3}
                placeholder="Descreva a evolução do estado emocional do acolhido..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="bg-black/30 border-white/10 text-xs text-white resize-none"
              />

              <Textarea
                rows={2}
                placeholder="Conduta ou orientações oferecidas (opcional)..."
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                className="bg-black/30 border-white/10 text-xs text-white resize-none"
              />

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAdd(false)}
                  className="text-white/60 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => addMutation.mutate()}
                  disabled={!summary.trim() || addMutation.isPending}
                  className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                >
                  {addMutation.isPending ? "Salvando..." : "Salvar no Prontuário"}
                </Button>
              </div>
            </div>
          )}

          {/* Lista de Registros Anteriores */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Histórico de Acolhimentos ({records.length})
            </h4>

            {isLoading ? (
              <p className="text-xs text-white/40">Carregando histórico do acolhido...</p>
            ) : records.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400/80 mb-2" />
                <p className="text-xs text-white/70">Nenhum prontuário registrado ainda para este acolhido.</p>
                <p className="text-[11px] text-white/40 mt-1">Este é o primeiro registro ou as notas anteriores estão arquivadas.</p>
              </div>
            ) : (
              records.map((rec) => (
                <div key={rec.id} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/50">{fmtDateTime(rec.createdAt)}</span>
                    {riskBadge(rec.riskLevel)}
                  </div>

                  <p className="text-xs text-white/90 leading-relaxed">{rec.summary}</p>

                  {rec.actionTaken && (
                    <div className="rounded bg-black/20 p-2 text-[11px] text-white/70 border-l-2 border-amber-400">
                      <span className="font-semibold text-amber-300">Conduta: </span>
                      {rec.actionTaken}
                    </div>
                  )}

                  <div className="pt-1 text-[10px] text-white/40 flex justify-between">
                    <span>Atendido por: {rec.volunteerName || "Voluntário"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
