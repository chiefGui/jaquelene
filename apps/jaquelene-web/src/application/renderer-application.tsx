import { ErrorSeverity } from "@jaquelene/diagnostics";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installUnhandledErrorReporting, reportError } from "@/feature/diagnostics/diagnostics";
import { installModelCatalogEvents } from "@/feature/model/catalog-events";
import { installThreadSettlementReconciliation } from "@/feature/thread/query";
import { installUsageEvents } from "@/feature/usage/events";
import { RendererErrorBoundary } from "@/layout/renderer-error";
import { routeTree } from "../routeTree.gen";

function createApplicationRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    disableGlobalCatchBoundary: true,
  });
}

type ApplicationRouter = ReturnType<typeof createApplicationRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: ApplicationRouter;
  }
}

export type RendererApplicationInspection = Readonly<{
  state: "created" | "running" | "closed" | "failed";
  terminalFailure?: unknown;
}>;

export type RendererApplication = Readonly<{
  inspect: () => RendererApplicationInspection;
  close: () => void;
}>;

type ResourceStack = Readonly<{
  disposed: boolean;
  defer: (onDispose: () => void) => void;
  dispose: () => void;
}>;

const NativeDisposableStack = (
  globalThis as unknown as { DisposableStack: new () => ResourceStack }
).DisposableStack;
const disposeSymbol = (Symbol as unknown as { readonly dispose: symbol }).dispose;

export function bootstrapRendererApplication(): RendererApplication {
  const resources = new NativeDisposableStack();
  let state: RendererApplicationInspection["state"] = "created";
  let terminalFailure: unknown;

  function close() {
    if (state === "closed" || (state === "failed" && resources.disposed)) {
      return;
    }

    try {
      resources.dispose();
      state = "closed";
    } catch (error) {
      terminalFailure = error;
      state = "failed";
      reportError("renderer.close", error);
      throw error;
    }
  }

  function closeFromHost() {
    try {
      close();
    } catch {
      // close() already reported the complete DisposableStack failure.
    }
  }

  try {
    resources.defer(installUnhandledErrorReporting());

    const onPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) {
        closeFromHost();
      }
    };
    window.addEventListener("pagehide", onPageHide);
    resources.defer(() => window.removeEventListener("pagehide", onPageHide));

    const queryClient = new QueryClient();
    resources.defer(() => queryClient.clear());
    resources.defer(installThreadSettlementReconciliation(queryClient));
    resources.defer(installUsageEvents(queryClient));
    resources.defer(installModelCatalogEvents(queryClient));

    const router = createApplicationRouter(queryClient);
    const rootElement = document.querySelector<HTMLDivElement>("#root");

    if (!rootElement) {
      throw new Error("Unable to find the application root.");
    }

    const root = createRoot(rootElement);
    resources.defer(() => root.unmount());
    root.render(
      <StrictMode>
        <RendererErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </RendererErrorBoundary>
      </StrictMode>,
    );
    state = "running";
  } catch (error) {
    terminalFailure = error;
    state = "failed";
    reportError("renderer.start", error, ErrorSeverity.Fatal);

    try {
      resources.dispose();
    } catch (closeError) {
      reportError("renderer.start.close", closeError);
    }

    throw error;
  }

  const rendererApplication: RendererApplication = {
    inspect: () => ({
      state,
      ...(terminalFailure === undefined ? {} : { terminalFailure }),
    }),
    close,
    [disposeSymbol]: close,
  };

  if (import.meta.hot) {
    import.meta.hot.dispose(closeFromHost);
  }

  return rendererApplication;
}
