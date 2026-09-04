import type { RegisteredRouter, ToOptions } from "@tanstack/react-router";
import type { FileRoutesByTo } from "@/routeTree.gen";

export type NavigationDestination = {
  [Path in keyof FileRoutesByTo]: ToOptions<RegisteredRouter, string, Path> & {
    replace?: boolean;
    to: Path;
  };
}[keyof FileRoutesByTo];

type BackNavigationRouter = Readonly<{
  history: Pick<RegisteredRouter["history"], "back" | "canGoBack">;
  navigate: (destination: NavigationDestination) => unknown;
}>;

const homeDestination = {
  to: "/",
  replace: true,
} as const satisfies NavigationDestination;

export function navigateBack(
  router: BackNavigationRouter,
  fallback: NavigationDestination = homeDestination,
) {
  if (router.history.canGoBack()) {
    router.history.back();
    return;
  }

  void router.navigate(fallback);
}
