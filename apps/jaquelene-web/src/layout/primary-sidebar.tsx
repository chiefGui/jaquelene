import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import HardDriveIcon from "@hugeicons/core-free-icons/HardDriveIcon";
import Home01Icon from "@hugeicons/core-free-icons/Home01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useMatchRoute } from "@tanstack/react-router";

const homeSidebar = {
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
} as const;

const settingsSidebar = {
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
} as const;

const contextualSidebars = [{ route: "/settings", sidebar: settingsSidebar }] as const;

export function PrimarySidebar() {
  const matchRoute = useMatchRoute();
  const sidebar =
    contextualSidebars.find(({ route }) => matchRoute({ to: route, fuzzy: true }))?.sidebar ??
    homeSidebar;

  return (
    <aside aria-label="Primary sidebar" className="flex min-h-0 flex-col bg-canvas">
      <header className="flex h-14 items-center px-4">
        <span className="text-sm font-semibold tracking-tight">Jaquelene</span>
      </header>

      <nav aria-label={sidebar.navigationLabel} className="px-2">
        <ul className="space-y-0.5">
          {sidebar.items.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: true }}
                className="flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-muted"
                activeProps={{ className: "bg-surface text-foreground" }}
                inactiveProps={{ className: "text-muted" }}
              >
                <HugeiconsIcon
                  icon={item.icon}
                  size={16}
                  color="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="shrink-0"
                />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="mt-auto p-2">
        <Link
          to={sidebar.action.to}
          aria-label={sidebar.action.label}
          className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-muted"
        >
          <HugeiconsIcon
            icon={sidebar.action.icon}
            size={16}
            color="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
            className="shrink-0"
          />
        </Link>
      </footer>
    </aside>
  );
}
