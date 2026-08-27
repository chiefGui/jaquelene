import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import HardDriveIcon from "@hugeicons/core-free-icons/HardDriveIcon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  staticData: {
    primarySidebar: {
      navigationLabel: "Settings",
      items: [
        {
          icon: Settings01Icon,
          label: "General",
          to: "/settings/general",
        },
        {
          icon: HardDriveIcon,
          label: "Storage",
          to: "/settings/storage",
        },
      ],
      action: {
        icon: ArrowLeft01Icon,
        label: "Back to home",
        to: "/",
      },
    },
  },
  component: Outlet,
});
