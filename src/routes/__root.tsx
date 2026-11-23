import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProfileProvider } from "@/contexts/ProfileContext";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { PwaManager } from "@/components/pwa/PwaManager";
import { Toaster } from "@/components/ui/sonner";
import { GlobalTooltips } from "@/components/common/GlobalTooltips";
import { Illustration } from "@/components/common/Illustration";
import { applyA11y, loadA11y } from "@/lib/a11y";

function NotFoundComponent() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <Illustration kind="lost" className="mx-auto h-44" />
        <p className="mt-2 font-display text-6xl font-semibold text-primary">404</p>
        <h1 className="mt-2 text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida. Mas você não está perdido(a): vamos voltar.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-md transition hover:opacity-90"
        >
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <Illustration kind="oops" className="mx-auto h-44" />
        <h1 className="mt-2 font-display text-2xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Não foi culpa sua. Tente de novo em alguns instantes. Se precisar de ajuda agora, ligue 188 (CVV) ou 192 (SAMU).
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-md hover:opacity-90"
          >
            Tentar de novo
          </button>
          <a href="/" className="rounded-full border px-5 py-2.5 text-sm font-medium hover:bg-muted">
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // aplica as preferências de acessibilidade em qualquer tela (inclusive login)
  useEffect(() => {
    applyA11y(loadA11y());
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ProfileProvider>
          <OfflineIndicator />
          <PwaManager />
          <Outlet />
          <GlobalTooltips />
          <Toaster richColors closeButton position="top-center" />
        </ProfileProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
