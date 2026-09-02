import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { IconButton, Skeleton } from "@jaquelene/ui";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
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
  accessibleLabel?: string;
  icon: IconSvgElement;
  label: string;
  preload?: Exclude<LinkProps["preload"], undefined>;
  replace?: Exclude<LinkProps["replace"], undefined>;
  trailingLabel?: string;
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
  loadingItemCount?: number;
  loadingTrailingLabel?: boolean;
  trailingAction?: {
    label: string;
    onSelect: () => void;
    pending: boolean;
  };
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

      <nav
        aria-label={navigation.navigationLabel}
        aria-busy={navigation.loadingItemCount ? true : undefined}
        {...stylex.props(styles.navigation)}
      >
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

            const { accessibleLabel, id, icon, label, trailingLabel, ...destination } = item;

            return (
              <li key={id}>
                <Link
                  {...destination}
                  activeOptions={{ exact: true }}
                  aria-label={accessibleLabel}
                  {...stylex.props(styles.navigationItem)}
                >
                  <PrimarySidebarItemContent
                    icon={icon}
                    label={label}
                    {...(trailingLabel === undefined ? {} : { trailingLabel })}
                  />
                </Link>
              </li>
            );
          })}
          {Array.from({ length: navigation.loadingItemCount ?? 0 }, (_, index) => (
            <li key={`loading-${index}`}>
              <div {...stylex.props(styles.loadingItem)}>
                <Skeleton style={styles.loadingIcon} />
                <Skeleton style={styles.loadingLabel} />
                {navigation.loadingTrailingLabel ? (
                  <Skeleton style={styles.loadingTrailingLabel} />
                ) : null}
              </div>
            </li>
          ))}
          {navigation.trailingAction ? (
            <li>
              <button
                type="button"
                aria-busy={navigation.trailingAction.pending || undefined}
                disabled={navigation.trailingAction.pending}
                onClick={navigation.trailingAction.onSelect}
                {...stylex.props(styles.navigationItem, styles.trailingAction)}
              >
                <span {...stylex.props(styles.label)}>{navigation.trailingAction.label}</span>
              </button>
            </li>
          ) : null}
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

function PrimarySidebarItemContent({
  icon,
  label,
  trailingLabel,
}: {
  icon: IconSvgElement;
  label: string;
  trailingLabel?: string;
}) {
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
      {trailingLabel === undefined ? null : (
        <span aria-hidden="true" {...stylex.props(styles.trailingLabel)}>
          {trailingLabel}
        </span>
      )}
    </>
  );
}

const focusColor = colors.focusRing;
const hoverBackground = colors.backgroundNeutralSubtler;

const styles = stylex.create({
  root: {
    backgroundColor: colors.backgroundCanvas,
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
      ':is([data-status="active"])': colors.backgroundSelected,
      ':is([data-status="active"]):hover': colors.backgroundSelectedHover,
    },
    borderRadius: radii.control,
    color: {
      default: colors.foregroundSecondary,
      ":hover": colors.foregroundPrimary,
      ':is([data-status="active"])': colors.foregroundPrimary,
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
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textBox: "trim-both text",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  trailingAction: {
    paddingInlineStart: "2rem",
  },
  trailingLabel: {
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
    marginInlineStart: "auto",
    opacity: 0.64,
  },
  loadingItem: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    height: "2.25rem",
    paddingInline: "0.5rem",
  },
  loadingIcon: {
    flexShrink: 0,
    height: "1rem",
    width: "1rem",
  },
  loadingLabel: {
    height: "0.75rem",
    width: "7rem",
  },
  loadingTrailingLabel: {
    flexShrink: 0,
    height: "0.75rem",
    marginInlineStart: "auto",
    width: "1.5rem",
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
