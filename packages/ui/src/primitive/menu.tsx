import {
  Menu as AriakitMenu,
  MenuButton,
  MenuItem,
  MenuProvider,
  useMenuContext,
  type MenuButtonProps,
  type MenuItemProps,
  type MenuProps,
  type MenuProviderProps,
  type MenuStore,
} from "@ariakit/react/menu";
import { useStoreState } from "@ariakit/react/store";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useLayoutEffect, type ComponentProps } from "react";
import { colors, radii, shadows, tokens } from "../tokens.stylex";
import { Popover } from "./popover";
import { ControlIcon } from "./control-icon";

type Styleable<Props> = Omit<Props, "className" | "style"> & { style?: StyleXStyles };

function Root(props: MenuProviderProps) {
  return <MenuProvider placement="bottom-start" {...props} />;
}

function Submenu(props: Omit<MenuProviderProps, "parent">) {
  const parent = useMenuContext();
  if (!parent) {
    throw new Error("Menu.Submenu must be used inside a menu.");
  }
  return <MenuProvider placement="right-start" {...props} parent={parent} />;
}

function Surface({
  store,
  ...props
}: ComponentProps<typeof Popover.Surface> & { store: MenuStore }) {
  const open = useStoreState(store, "open");
  const parentOpen = useStoreState(store.parent, "open") ?? true;

  useLayoutEffect(() => {
    if (!parentOpen) store.hide();
  }, [store, parentOpen]);

  const hidden = !open || !parentOpen;
  return <Popover.Surface {...props} inert={hidden} aria-hidden={hidden || undefined} />;
}

function SubmenuTrigger({ children, style, ...props }: Styleable<Omit<MenuButtonProps, "render">>) {
  return (
    <MenuButton
      {...props}
      render={<MenuItem />}
      {...stylex.props(styles.item, styles.submenuTrigger, style)}
    >
      {children}
      <ControlIcon.Chevron style={styles.submenuIndicator} />
    </MenuButton>
  );
}

function Content({
  store,
  style,
  ...props
}: Styleable<Omit<MenuProps, "alwaysVisible" | "render" | "unmountOnHide">>) {
  const context = useMenuContext();
  const menu = store ?? context;
  const mounted = useStoreState(menu, "mounted") ?? false;
  if (!menu) {
    throw new Error("Menu.Content must be used inside Menu.Root.");
  }
  return (
    <Popover.Presence present={mounted}>
      <AriakitMenu
        portal
        gutter={8}
        {...props}
        store={menu}
        alwaysVisible
        render={<Surface store={menu} />}
        {...stylex.props(styles.content, style)}
      />
    </Popover.Presence>
  );
}

function Item({ style, ...props }: Styleable<MenuItemProps>) {
  return <MenuItem {...props} {...stylex.props(styles.item, style)} />;
}

export const Menu = { Root, Trigger: MenuButton, Content, Item, Submenu, SubmenuTrigger } as const;

const styles = stylex.create({
  content: {
    backgroundColor: colors.backgroundSurfaceOverlay,
    borderColor: colors.borderOverlay,
    borderRadius: radii.surface,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadows.floating,
    color: colors.foregroundPrimary,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    maxHeight: "min(24rem, var(--popover-available-height, 24rem))",
    maxWidth: "calc(100vw - 2rem)",
    minWidth: "12rem",
    outline: "none",
    overflowY: "auto",
    padding: "0.25rem",
    zIndex: 50,
  },
  item: {
    backgroundColor: {
      default: "transparent",
      ":hover:not([aria-disabled='true'])": colors.backgroundInteractive,
      ":is([data-active-item])": colors.backgroundInteractive,
    },
    borderRadius: radii.compact,
    color: {
      default: colors.foregroundPrimary,
      ":is([aria-disabled='true'])": colors.foregroundDisabled,
    },
    display: "flex",
    flexShrink: 0,
    fontSize: tokens.fontSizeSmall,
    gap: "0.5rem",
    lineHeight: tokens.lineHeightSmall,
    minWidth: 0,
    outline: "none",
    padding: "0.5rem 0.75rem",
    textAlign: "start",
    textDecoration: "none",
  },
  submenuTrigger: {
    alignItems: "center",
  },
  submenuIndicator: {
    height: "0.75rem",
    marginInlineStart: "auto",
    width: "0.75rem",
  },
});
