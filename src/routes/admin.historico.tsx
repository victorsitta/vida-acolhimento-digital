import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/layouts/AppShell";
import { ConversationHistory } from "@/components/chat/ConversationHistory";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/admin/historico")({
  head: () => ({ meta: [{ title: "Histórico de conversas — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  return (
    <AppShell>
      <ConversationHistory identity />
    </AppShell>
  );
}
