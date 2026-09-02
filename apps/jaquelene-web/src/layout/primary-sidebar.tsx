import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { IconButton } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  Link,
  type LinkProps,
  type RegisteredRouter,
  type ToOptions,
  useMatchRoute,
  useRouter,
} from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { FileRoutesByTo } from "@/routeTree.gen";
import { shellChrome } from "./shell-chrome.stylex";

type PrimarySidebarDestination = {
  [Path in keyof FileRoutesByTo]: ToOptions<RegisteredRouter, string, Path> & { to: Path };
}[keyof FileRoutesByTo];

type PrimarySidebarLink = PrimarySidebarDestination & {
  icon: IconSvgElement;
  label: string;
  preload?: Exclude<LinkProps["preload"], undefined>;
  replace?: Exclude<LinkProps["replace"], undefined>;
};

type PrimarySidebarItem =
  | (PrimarySidebarLink & { id: string })
  | {
      action: "history-back";
      icon: IconSvgElement;
      id: string;
      label: string;
    };

interface PrimarySidebarNavigation {
  navigationLabel: string;
  items: readonly PrimarySidebarItem[];
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    primarySidebar?: ComponentType;
  }
}

export function PrimarySidebar({ navigation }: { navigation: PrimarySidebarNavigation }) {
  const matchRoute = useMatchRoute();
  const router = useRouter();
  const settingsActive = Boolean(matchRoute({ to: "/settings", fuzzy: true }));
  const footerIcon = (
    <HugeiconsIcon
      icon={settingsActive ? ArrowLeft01Icon : Settings01Icon}
      size={16}
      color="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      {...stylex.props(styles.icon)}
    />
  );

  function returnFromSettings() {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }

    void router.navigate({ to: "/" });
  }

  return (
    <aside aria-label="Primary sidebar" {...stylex.props(styles.root)}>
      <header {...stylex.props(shellChrome.header, styles.header)}>
        <span {...stylex.props(styles.brand)}>Jaquelene</span>
      </header>

      <nav aria-label={navigation.navigationLabel} {...stylex.props(styles.navigation)}>
        <ul {...stylex.props(styles.list)}>
          {navigation.items.map((item) => {
            if ("action" in item) {
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={returnFromSettings}
                    {...stylex.props(styles.navigationItem)}
                  >
                    <PrimarySidebarItemContent icon={item.icon} label={item.label} />
                  </button>
                </li>
              );
            }

            const { id, icon, label, ...destination } = item;

            return (
              <li key={id}>
                <Link
                  {...destination}
                  activeOptions={{ exact: true }}
                  {...stylex.props(styles.navigationItem)}
                >
                  <PrimarySidebarItemContent icon={icon} label={label} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <footer {...stylex.props(styles.footer)}>
        {settingsActive ? (
          <IconButton
            type="button"
            aria-label="Back"
            onClick={returnFromSettings}
            style={styles.footerAction}
          >
            {footerIcon}
          </IconButton>
        ) : (
          <IconButton
            render={<Link to="/settings/general" preload="render" />}
            aria-label="Settings"
            style={styles.footerAction}
          >
            {footerIcon}
          </IconButton>
        )}
      </footer>
    </aside>
  );
}

function PrimarySidebarItemContent({ icon, label }: { icon: IconSvgElement; label: string }) {
  return (
    <>
      <HugeiconsIcon
        icon={icon}
        size={16}
        color="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
        {...stylex.props(styles.icon)}
      />
      <span {...stylex.props(styles.label)}>{label}</span>
    </>
  );
}

const focusColor = `color-mix(in oklab, ${tokens.accent} 60%, transparent)`;
const hoverBackground = `color-mix(in oklab, ${tokens.accent} 10%, transparent)`;

const styles = stylex.create({
  root: {
    backgroundColor: tokens.canvas,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  header: {
    paddingInline: "1rem",
  },
  brand: {
    fontSize: tokens.fontSizeSmall,
    fontWeight: 600,
    letterSpacing: "-0.025em",
    lineHeight: tokens.lineHeightSmall,
    textBox: "trim-both text",
  },
  navigation: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingInline: "0.5rem",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
  },
  navigationItem: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": hoverBackground,
      ':is([data-status="active"])': hoverBackground,
      ':is([data-status="active"]):hover': `color-mix(in oklab, ${tokens.accent} 15%, transparent)`,
    },
    borderRadius: tokens.radiusMedium,
    color: {
      default: tokens.muted,
      ":hover": tokens.foreground,
      ':is([data-status="active"])': tokens.foreground,
    },
    display: "flex",
    fontSize: tokens.fontSizeSmall,
    gap: "0.5rem",
    height: "2.25rem",
    lineHeight: tokens.lineHeightSmall,
    minWidth: 0,
    outlineColor: {
      default: null,
      ":focus-visible": focusColor,
    },
    outlineOffset: {
      default: null,
      ":focus-visible": 2,
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: {
      default: null,
      ":focus-visible": 1,
    },
    paddingInline: "0.5rem",
    textAlign: "start",
    width: "100%",
  },
  icon: {
    flexShrink: 0,
  },
  label: {
    overflow: "hidden",
    textBox: "trim-both text",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footer: {
    flexShrink: 0,
    padding: "0.5rem",
  },
  footerAction: {
    height: "2.25rem",
    width: "2.25rem",
  },
});
