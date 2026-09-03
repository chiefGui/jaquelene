import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
import { MotionProvider } from "@jaquelene/ui/motion";
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { PrimarySidebar } from "./primary-sidebar";

type PrimarySidebarNavigation = ComponentProps<typeof PrimarySidebar>["navigation"];

function renderSidebar(navigation: PrimarySidebarNavigation, initialEntry: string) {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
  const campaignsRoute = createRoute({ getParentRoute: () => rootRoute, path: "campaigns" });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "settings/general",
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, campaignsRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <MotionProvider mode="reduced">
        <PrimarySidebar navigation={navigation} />
      </MotionProvider>
    </RouterContextProvider>,
  );
}

describe("primary sidebar", () => {
  it("renders the persistent utility actions outside Settings", () => {
    const markup = renderSidebar(
      {
        navigationLabel: "Campaigns",
        items: [
          {
            id: "campaigns",
            icon: Home01Icon,
            label: "Campaigns",
            to: "/campaigns",
          },
        ],
      },
      "/campaigns",
    );

    expect(markup).toContain("<footer");
    expect(markup).toContain('aria-label="Settings"');
    expect(markup).toContain('href="/settings/general"');
    expect(markup).toContain('aria-label="Library"');
    expect(markup).toContain('href="/library/narrator"');
    expect(markup).not.toContain("<button");
  });

  it("renders one Back action in Settings", () => {
    const markup = renderSidebar(
      {
        navigationLabel: "Settings",
        items: [
          {
            id: "general",
            icon: Home01Icon,
            label: "General",
            replace: true,
            to: "/settings/general",
          },
        ],
      },
      "/settings/general",
    );
    const footerMarkup = markup.slice(markup.indexOf("<footer"));

    expect(footerMarkup).toContain("<button");
    expect(footerMarkup).toContain('type="button"');
    expect(footerMarkup).toContain('aria-label="Back"');
    expect(footerMarkup).not.toContain('aria-label="Settings"');
    expect(footerMarkup).not.toContain('aria-label="Library"');
    expect(footerMarkup.match(/<button/g)).toHaveLength(1);
  });
});
