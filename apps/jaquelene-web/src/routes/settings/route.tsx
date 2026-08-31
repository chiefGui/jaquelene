import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ConnectIcon from "@hugeicons/core-free-icons/ConnectIcon";
import HardDriveIcon from "@hugeicons/core-free-icons/HardDriveIcon";
import PaletteIcon from "@hugeicons/core-free-icons/PaletteIcon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import ToolsIcon from "@hugeicons/core-free-icons/ToolsIcon";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PrimarySidebar, type PrimarySidebarComponentProps } from "@/layout/primary-sidebar";

function SettingsSidebar(props: PrimarySidebarComponentProps) {
  return (
    <PrimarySidebar
      {...props}
      navigation={{
        navigationLabel: "Settings",
        items: [
          {
            action: "history-back",
            id: "back",
            icon: ArrowLeft01Icon,
            label: "Back",
          },
          {
            id: "general",
            icon: Settings01Icon,
            label: "General",
            replace: true,
            to: "/settings/general",
          },
          {
            id: "appearance",
            icon: PaletteIcon,
            label: "Appearance",
            replace: true,
            to: "/settings/appearance",
          },
          {
            id: "providers",
            icon: ConnectIcon,
            label: "Providers",
            preload: "render",
            replace: true,
            to: "/settings/providers",
          },
          {
            id: "storage",
            icon: HardDriveIcon,
            label: "Storage",
            replace: true,
            to: "/settings/storage",
          },
          {
            id: "advanced",
            icon: ToolsIcon,
            label: "Advanced",
            replace: true,
            to: "/settings/advanced",
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
