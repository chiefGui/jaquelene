import AiFile01Icon from "@hugeicons/core-free-icons/AiFile01Icon";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ConnectIcon from "@hugeicons/core-free-icons/ConnectIcon";
import ChartHistogramIcon from "@hugeicons/core-free-icons/ChartHistogramIcon";
import HardDriveIcon from "@hugeicons/core-free-icons/HardDriveIcon";
import Edit02Icon from "@hugeicons/core-free-icons/Edit02Icon";
import PaletteIcon from "@hugeicons/core-free-icons/PaletteIcon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import ToolsIcon from "@hugeicons/core-free-icons/ToolsIcon";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PrimarySidebar } from "@/layout/primary-sidebar";

function SettingsSidebar() {
  return (
    <PrimarySidebar
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
            id: "prompts",
            icon: AiFile01Icon,
            label: "Prompts",
            replace: true,
            to: "/settings/prompts",
          },
          {
            id: "markdown-editor",
            icon: Edit02Icon,
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
