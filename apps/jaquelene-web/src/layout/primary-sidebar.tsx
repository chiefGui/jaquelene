import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Bookshelf01Icon from "@hugeicons/core-free-icons/Bookshelf01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { IconButton, Skeleton } from "@jaquelene/ui";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { Link, type LinkProps, useMatchRoute, useRouter } from "@tanstack/react-router";
import type { ComponentType, ReactElement } from "react";
import { navigateBack, type NavigationDestination } from "@/application/navigation";
import { shellChrome } from "./shell-chrome.stylex";

type PrimarySidebarLink = NavigationDestination & {
  activeOptions?: LinkProps["activeOptions"];
  icon: IconSvgElement;
  label: string;
  preload?: Exclude<LinkProps["preload"], undefined>;
  replace?: boolean;
};

type PrimarySidebarItem = PrimarySidebarLink & { id: string };

interface PrimarySidebarNavigation {
  backDestination?: NavigationDestination;
  navigationLabel: string;
  items: readonly PrimarySidebarItem[];
  loadingItemCount?: number;
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
  const libraryActive = Boolean(matchRoute({ to: "/library", fuzzy: true }));
  const utilityAreaActive = settingsActive || libraryActive;

  function handleBack() {
    if (navigation.backDestination) {
      void router.navigate({ ...navigation.backDestination, replace: true });
      return;
    }

    navigateBack(router);
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
            const { activeOptions = { exact: true }, id, icon, label, ...destination } = item;

            return (
              <li key={id}>
                <Link
                  {...destination}
                  activeOptions={activeOptions}
                  {...stylex.props(styles.navigationItem)}
                >
                  <PrimarySidebarItemContent icon={icon} label={label} />
                </Link>
              </li>
            );
          })}
          {Array.from({ length: navigation.loadingItemCount ?? 0 }, (_, index) => (
            <li key={`loading-${index}`}>
              <div {...stylex.props(styles.loadingItem)}>
                <Skeleton style={styles.loadingIcon} />
                <Skeleton style={styles.loadingLabel} />
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
        {utilityAreaActive ? (
          <PrimarySidebarFooterAction
            label="Back"
            action={
              <IconButton.Root
                type="button"
                aria-label="Back"
                onClick={handleBack}
                style={styles.footerAction}
              >
                <IconButton.Icon render={<HugeiconsIcon icon={ArrowLeft01Icon} />} />
              </IconButton.Root>
            }
          />
        ) : (
          <>
            <PrimarySidebarFooterAction
              label="Settings"
              action={
                <IconButton.Root
                  render={<Link to="/settings/general" preload="render" />}
                  aria-label="Settings"
                  style={styles.footerAction}
                >
                  <IconButton.Icon render={<HugeiconsIcon icon={Settings01Icon} />} />
                </IconButton.Root>
              }
            />
            <PrimarySidebarFooterAction
              label="Library"
              action={
                <IconButton.Root
                  render={<Link to="/library/narrator" preload="render" />}
                  aria-label="Library"
                  style={styles.footerAction}
                >
                  <IconButton.Icon render={<HugeiconsIcon icon={Bookshelf01Icon} />} />
                </IconButton.Root>
              }
            />
          </>
        )}
      </footer>
    </aside>
  );
}

function PrimarySidebarFooterAction({ action, label }: { action: ReactElement; label: string }) {
  return (
    <Tooltip.Root placement="top">
      <Tooltip.Anchor render={action} />
      <Tooltip>{label}</Tooltip>
    </Tooltip.Root>
  );
}

function PrimarySidebarIcon({ icon }: { icon: IconSvgElement }) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={16}
      color="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      {...stylex.props(styles.icon)}
    />
  );
}

function PrimarySidebarItemContent({ icon, label }: { icon: IconSvgElement; label: string }) {
  return (
    <>
      <PrimarySidebarIcon icon={icon} />
      <span {...stylex.props(styles.label)}>{label}</span>
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
    overflow: "hidden",
    textBox: "trim-both text",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  trailingAction: {
    paddingInlineStart: "2rem",
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
  footer: {
    display: "flex",
    flexShrink: 0,
    gap: "0.25rem",
    padding: "0.5rem",
  },
  footerAction: {
    height: "2.25rem",
    width: "2.25rem",
  },
});
