import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/layouts/AppShell";
import { ConversationHistory } from "@/components/chat/ConversationHistory";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/app/historico")({
  head: () => ({ meta: [{ title: "Histórico — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  return (
    <AppShell>
      <ConversationHistory
        resume="app"
        title="Histórico"
        description="Suas conversas com os voluntários. Abra uma para reler as mensagens ou volte a uma conversa em andamento."
      />
    </AppShell>
  );
}
