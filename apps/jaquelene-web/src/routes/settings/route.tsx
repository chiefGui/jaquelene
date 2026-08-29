import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ConnectIcon from "@hugeicons/core-free-icons/ConnectIcon";
import HardDriveIcon from "@hugeicons/core-free-icons/HardDriveIcon";
import PaletteIcon from "@hugeicons/core-free-icons/PaletteIcon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PrimarySidebar } from "@/layout/primary-sidebar";

function SettingsSidebar() {
  return (
    <PrimarySidebar
      navigation={{
        navigationLabel: "Settings",
        items: [
          {
            id: "back",
            icon: ArrowLeft01Icon,
            label: "Back",
            to: "/",
          },
          {
            id: "general",
            icon: Settings01Icon,
            label: "General",
            to: "/settings/general",
          },
          {
            id: "appearance",
            icon: PaletteIcon,
            label: "Appearance",
            to: "/settings/appearance",
          },
          {
            id: "providers",
            icon: ConnectIcon,
            label: "Providers",
            preload: "render",
            to: "/settings/providers",
          },
          {
            id: "storage",
            icon: HardDriveIcon,
            label: "Storage",
            to: "/settings/storage",
          },
        ],
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
