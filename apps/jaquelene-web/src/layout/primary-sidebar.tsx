import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link, type RegisteredRouter, type ToOptions } from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { FileRoutesByTo } from "@/routeTree.gen";

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
  footerAction?: PrimarySidebarLink;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    primarySidebar?: ComponentType;
  }
}

export function PrimarySidebar({ navigation }: { navigation: PrimarySidebarNavigation }) {
  let footer = null;

  if (navigation.footerAction) {
    const { icon, label, ...destination } = navigation.footerAction;

    footer = (
      <footer className="shrink-0 p-2">
        <Link
          {...destination}
          aria-label={label}
          className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-accent/10 hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
        >
          <HugeiconsIcon
            icon={icon}
            size={16}
            color="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
            className="shrink-0"
          />
        </Link>
      </footer>
    );
  }

  return (
    <aside aria-label="Primary sidebar" className="flex min-h-0 flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center px-4">
        <span className="text-sm font-semibold tracking-tight text-box-trim">Jaquelene</span>
      </header>

      <nav aria-label={navigation.navigationLabel} className="min-h-0 flex-1 overflow-y-auto px-2">
        <ul className="space-y-0.5">
          {navigation.items.map(({ id, icon, label, ...destination }) => (
            <li key={id}>
              <Link
                {...destination}
                activeOptions={{ exact: true }}
                className="flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-sm hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
                activeProps={{ className: "bg-accent/10 text-foreground hover:bg-accent/15" }}
                inactiveProps={{ className: "text-muted hover:bg-accent/10" }}
              >
                <HugeiconsIcon
                  icon={icon}
                  size={16}
                  color="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                  className="shrink-0"
                />
                <span className="truncate text-box-trim">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {footer}
    </aside>
  );
}
