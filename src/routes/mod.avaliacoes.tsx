import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/layouts/AppShell";
import { VolunteerRatings } from "@/components/chat/VolunteerRatings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthGuard } from "@/hooks/useAuthGuard";

export const Route = createFileRoute("/mod/avaliacoes")({
  head: () => ({ meta: [{ title: "Avaliações — VIDA+" }] }),
  component: Page,
});

function Page() {
  useAuthGuard();
  return (
    <AppShell>
      <Tabs defaultValue="voluntarios">
        <TabsList className="mb-5">
          <TabsTrigger value="voluntarios">Voluntários</TabsTrigger>
          <TabsTrigger value="moderacao">Moderação</TabsTrigger>
        </TabsList>
        <TabsContent value="voluntarios">
          <VolunteerRatings />
        </TabsContent>
        <TabsContent value="moderacao">
          <VolunteerRatings source="moderators" />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
