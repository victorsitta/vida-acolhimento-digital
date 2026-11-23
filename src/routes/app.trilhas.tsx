import { createFileRoute, redirect } from "@tanstack/react-router";

// As trilhas agora moram dentro de Bem-estar.
export const Route = createFileRoute("/app/trilhas")({
  beforeLoad: () => {
    throw redirect({ to: "/app/bem-estar", replace: true });
  },
});
