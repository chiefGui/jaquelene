import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link, type FileRoutesByPath } from "@tanstack/react-router";

interface PrimarySidebarLink {
  icon: IconSvgElement;
  label: string;
  to: Exclude<keyof FileRoutesByPath, `${string}$${string}`>;
}

export interface PrimarySidebarNavigation {
  navigationLabel: string;
  items: readonly PrimarySidebarLink[];
  action: PrimarySidebarLink;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    primarySidebar?: PrimarySidebarNavigation;
  }
}

export function PrimarySidebar({ navigation }: { navigation: PrimarySidebarNavigation }) {
  return (
    <aside aria-label="Primary sidebar" className="flex min-h-0 flex-col bg-canvas">
      <header className="flex h-14 items-center px-4">
        <span className="text-sm font-semibold tracking-tight">Jaquelene</span>
      </header>

      <nav aria-label={navigation.navigationLabel} className="px-2">
        <ul className="space-y-0.5">
          {navigation.items.map((item) => (
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
          to={navigation.action.to}
          aria-label={navigation.action.label}
          className="flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-muted"
        >
          <HugeiconsIcon
            icon={navigation.action.icon}
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
