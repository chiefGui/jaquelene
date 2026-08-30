import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installUnhandledErrorReporting } from "@/feature/diagnostics/diagnostics";
import { installThreadSettlementReconciliation } from "@/feature/thread/query";
import { RendererErrorBoundary } from "@/layout/renderer-error";
import { routeTree } from "./routeTree.gen";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/inter/wght.css";
import "./styles.css";

const queryClient = new QueryClient();
const stopThreadSettlementReconciliation = installThreadSettlementReconciliation(queryClient);
window.addEventListener("pagehide", stopThreadSettlementReconciliation, { once: true });
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  disableGlobalCatchBoundary: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

installUnhandledErrorReporting();

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Unable to find the application root.");
}

createRoot(root).render(
  <StrictMode>
    <RendererErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </RendererErrorBoundary>
  </StrictMode>,
);
