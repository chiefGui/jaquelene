import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { createRootRoute } from "@tanstack/react-router";
import { AppShell } from "../layout/app-shell";

export const Route = createRootRoute({
  staticData: {
    primarySidebar: {
      navigationLabel: "Home",
      items: [
        {
          icon: Home01Icon,
          label: "Home",
          to: "/",
        },
      ],
      action: {
        icon: Settings01Icon,
        label: "Settings",
        to: "/settings/general",
      },
    },
  },
  component: AppShell,
});
