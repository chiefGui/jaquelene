import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  Link,
  type LinkProps,
  type RegisteredRouter,
  type ToOptions,
} from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { FileRoutesByTo } from "@/routeTree.gen";

type PrimarySidebarDestination = {
  [Path in keyof FileRoutesByTo]: ToOptions<RegisteredRouter, string, Path> & { to: Path };
}[keyof FileRoutesByTo];

type PrimarySidebarLink = PrimarySidebarDestination & {
  icon: IconSvgElement;
  label: string;
  preload?: Exclude<LinkProps["preload"], undefined>;
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
      <footer {...stylex.props(styles.footer)}>
        <Link {...destination} aria-label={label} {...stylex.props(styles.footerLink)}>
          <HugeiconsIcon
            icon={icon}
            size={16}
            color="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
            {...stylex.props(styles.icon)}
          />
        </Link>
      </footer>
    );
  }

  return (
    <aside aria-label="Primary sidebar" {...stylex.props(styles.root)}>
      <header {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.brand)}>Jaquelene</span>
      </header>

      <nav aria-label={navigation.navigationLabel} {...stylex.props(styles.navigation)}>
        <ul {...stylex.props(styles.list)}>
          {navigation.items.map(({ id, icon, label, ...destination }) => (
            <li key={id}>
              <Link
                {...destination}
                activeOptions={{ exact: true }}
                {...stylex.props(styles.navigationLink)}
              >
                <HugeiconsIcon
                  icon={icon}
                  size={16}
                  color="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                  {...stylex.props(styles.icon)}
                />
                <span {...stylex.props(styles.label)}>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {footer}
    </aside>
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
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    height: "3.5rem",
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
  navigationLink: {
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
  footerLink: {
    alignItems: "center",
    borderRadius: tokens.radiusMedium,
    color: {
      default: tokens.muted,
      ":hover": tokens.foreground,
    },
    display: "flex",
    height: "2.25rem",
    justifyContent: "center",
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
    width: "2.25rem",
    backgroundColor: {
      default: "transparent",
      ":hover": hoverBackground,
    },
  },
});
