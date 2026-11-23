import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/layouts/AppShell";
import { MyReports } from "@/components/common/MyReports";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/app/denuncias")({
  head: () => ({ meta: [{ title: "Minhas denúncias — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  return (
    <AppShell>
      <MyReports />
    </AppShell>
  );
}
