import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/layouts/AppShell";
import { VolunteerRatings } from "@/components/chat/VolunteerRatings";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/vol/avaliacoes")({
  head: () => ({ meta: [{ title: "Avaliações — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  return (
    <AppShell>
      <VolunteerRatings mine />
    </AppShell>
  );
}
