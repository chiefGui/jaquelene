import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
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

function renderSidebar(navigation: PrimarySidebarNavigation) {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "settings/general",
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: ["/settings/general"] }),
  });

  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <PrimarySidebar navigation={navigation} />
    </RouterContextProvider>,
  );
}

describe("primary sidebar", () => {
  it("renders Back first without an empty footer", () => {
    const markup = renderSidebar({
      navigationLabel: "Nested navigation",
      items: [
        {
          id: "back",
          icon: ArrowLeft01Icon,
          label: "Back",
          to: "/",
        },
        {
          id: "nested-item",
          icon: Home01Icon,
          label: "Nested item",
          to: "/settings/general",
        },
      ],
    });
    const backPosition = markup.indexOf(">Back</span>");
    const nestedItemPosition = markup.indexOf(">Nested item</span>");

    expect(backPosition).toBeGreaterThan(-1);
    expect(backPosition).toBeLessThan(nestedItemPosition);
    expect(markup).not.toContain("<footer");
  });

  it("renders the footer action as a labelled link", () => {
    const markup = renderSidebar({
      navigationLabel: "Home navigation",
      items: [
        {
          id: "home",
          icon: Home01Icon,
          label: "Home",
          to: "/",
        },
      ],
      footerAction: {
        icon: Settings01Icon,
        label: "Settings action",
        to: "/settings/general",
      },
    });

    expect(markup).toContain("<footer");
    expect(markup).toContain('aria-label="Settings action"');
    expect(markup).toContain('href="/settings/general"');
  });
});
