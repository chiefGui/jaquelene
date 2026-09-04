import ConnectIcon from "@hugeicons/core-free-icons/ConnectIcon";
import ChartHistogramIcon from "@hugeicons/core-free-icons/ChartHistogramIcon";
import HardDriveIcon from "@hugeicons/core-free-icons/HardDriveIcon";
import PaletteIcon from "@hugeicons/core-free-icons/PaletteIcon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import ToolsIcon from "@hugeicons/core-free-icons/ToolsIcon";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PrimarySidebar } from "@/layout/primary-sidebar";
import { EditIcon } from "@/primitive/icons";

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
            id: "markdown-editor",
            icon: EditIcon,
            label: "Editor lab",
            replace: true,
            to: "/settings/markdown-editor",
          },
          {
            id: "usage",
            icon: ChartHistogramIcon,
            label: "Usage",
            replace: true,
            to: "/settings/usage",
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
