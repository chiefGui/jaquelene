import type { RegisteredRouter, ToOptions } from "@tanstack/react-router";
import type { FileRoutesByTo } from "@/routeTree.gen";

export type NavigationDestination = {
  [Path in keyof FileRoutesByTo]: Omit<ToOptions<RegisteredRouter, string, Path>, "replace"> & {
    to: Path;
  };
}[keyof FileRoutesByTo];

type ReplacementNavigationDestination = NavigationDestination & {
  replace: true;
};

type BackNavigationRouter = Readonly<{
  history: Pick<RegisteredRouter["history"], "back" | "canGoBack">;
  navigate: (destination: ReplacementNavigationDestination) => unknown;
}>;

const homeDestination = {
  to: "/",
} as const satisfies NavigationDestination;

export function navigateBack(
  router: BackNavigationRouter,
  fallback: NavigationDestination = homeDestination,
) {
  if (router.history.canGoBack()) {
    router.history.back();
    return;
  }

  void router.navigate({ ...fallback, replace: true });
}
