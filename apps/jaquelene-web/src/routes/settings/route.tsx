import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import HardDriveIcon from "@hugeicons/core-free-icons/HardDriveIcon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PrimarySidebar } from "../../layout/primary-sidebar";

function SettingsSidebar() {
  return (
    <PrimarySidebar
      navigation={{
        navigationLabel: "Settings",
        items: [
          {
            id: "general",
            icon: Settings01Icon,
            label: "General",
            to: "/settings/general",
          },
          {
            id: "storage",
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
      }}
    />
  );
}

export const Route = createFileRoute("/settings")({
  staticData: {
    primarySidebar: SettingsSidebar,
  },
  component: Outlet,
});
