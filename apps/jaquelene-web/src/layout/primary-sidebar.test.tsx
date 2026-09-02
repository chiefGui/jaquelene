import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
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
      <PrimarySidebar navigation={navigation} />
    </RouterContextProvider>,
  );
}

describe("primary sidebar", () => {
  it("renders the persistent Settings action outside Settings", () => {
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
    expect(markup).not.toContain("<button");
  });

  it("renders a Back button in Settings", () => {
    const markup = renderSidebar(
      {
        navigationLabel: "Settings",
        items: [
          {
            action: "history-back",
            id: "back",
            icon: Home01Icon,
            label: "Back",
          },
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
    const backPosition = markup.indexOf(">Back</span>");
    const generalPosition = markup.indexOf(">General</span>");
    const footerMarkup = markup.slice(markup.indexOf("<footer"));

    expect(backPosition).toBeGreaterThan(-1);
    expect(backPosition).toBeLessThan(generalPosition);
    expect(footerMarkup).toContain("<button");
    expect(footerMarkup).toContain('type="button"');
    expect(footerMarkup).toContain('aria-label="Back"');
    expect(footerMarkup).not.toContain('aria-label="Settings"');
  });
});
