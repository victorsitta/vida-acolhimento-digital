import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/layouts/AppShell";
import { ConversationHistory } from "@/components/chat/ConversationHistory";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/vol/historico")({
  head: () => ({ meta: [{ title: "Histórico de atendimentos — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  return (
    <AppShell>
      <ConversationHistory
        resume="vol"
        title="Histórico de atendimentos"
        description="Suas conversas com cada pessoa e o prontuário de cada uma."
      />
    </AppShell>
  );
}
