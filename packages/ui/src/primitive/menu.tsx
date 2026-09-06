import {
  Menu as AriakitMenu,
  MenuButton,
  MenuItem,
  MenuProvider,
  MenuSeparator,
  useMenuContext,
  type MenuItemProps,
  type MenuProps,
  type MenuProviderProps,
  type MenuSeparatorProps,
} from "@ariakit/react/menu";
import { useStoreState } from "@ariakit/react/store";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { colors, radii, shadows, tokens } from "../tokens.stylex";
import { Popover } from "./popover";

type Styleable<Props> = Omit<Props, "className" | "style"> & { style?: StyleXStyles };

function Root(props: MenuProviderProps) {
  return <MenuProvider placement="bottom-start" {...props} />;
}

function Content({
  style,
  ...props
}: Styleable<Omit<MenuProps, "alwaysVisible" | "render" | "unmountOnHide">>) {
  const menu = useMenuContext();
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
        alwaysVisible
        render={<Popover.Surface />}
        {...stylex.props(styles.content, style)}
      />
    </Popover.Presence>
  );
}

function Item({ style, ...props }: Styleable<MenuItemProps>) {
  return <MenuItem {...props} {...stylex.props(styles.item, style)} />;
}

function Separator({ style, ...props }: Styleable<MenuSeparatorProps>) {
  return <MenuSeparator {...props} {...stylex.props(styles.separator, style)} />;
}

export const Menu = { Root, Trigger: MenuButton, Content, Item, Separator } as const;

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
  separator: {
    border: 0,
    borderBlockStartColor: colors.borderOverlay,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    flexShrink: 0,
    margin: "0.125rem 0",
  },
});
