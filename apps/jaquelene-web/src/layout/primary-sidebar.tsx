import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link, type RegisteredRouter, type ToOptions } from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { FileRoutesByTo } from "../routeTree.gen";

type PrimarySidebarDestination = {
  [Path in keyof FileRoutesByTo]: ToOptions<RegisteredRouter, string, Path> & { to: Path };
}[keyof FileRoutesByTo];

type PrimarySidebarLink = PrimarySidebarDestination & {
  icon: IconSvgElement;
  label: string;
};

type PrimarySidebarItem = PrimarySidebarLink & { id: string };

interface PrimarySidebarNavigation {
  navigationLabel: string;
  items: readonly PrimarySidebarItem[];
  action: PrimarySidebarLink;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    primarySidebar?: ComponentType;
  }
}

export function PrimarySidebar({ navigation }: { navigation: PrimarySidebarNavigation }) {
  const { icon: actionIcon, label: actionLabel, ...actionDestination } = navigation.action;

  return (
    <aside aria-label="Primary sidebar" className="flex min-h-0 flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center px-4">
        <span className="text-sm font-semibold tracking-tight">Jaquelene</span>
      </header>

      <nav aria-label={navigation.navigationLabel} className="min-h-0 flex-1 overflow-y-auto px-2">
        <ul className="space-y-0.5">
          {navigation.items.map(({ id, icon, label, ...destination }) => (
            <li key={id}>
              <Link
                {...destination}
                activeOptions={{ exact: true }}
                className="flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-muted"
                activeProps={{ className: "bg-surface text-foreground" }}
                inactiveProps={{ className: "text-muted" }}
              >
                <HugeiconsIcon
                  icon={icon}
                  size={16}
                  color="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="shrink-0"
                />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="shrink-0 p-2">
        <Link
          {...actionDestination}
          aria-label={actionLabel}
          className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-muted"
        >
          <HugeiconsIcon
            icon={actionIcon}
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
