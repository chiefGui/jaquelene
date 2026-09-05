import {
  Menu as AriakitMenu,
  MenuButton,
  MenuItem as AriakitMenuItem,
  MenuProvider,
  useMenuContext,
  type MenuItemProps,
  type MenuProps,
  type MenuProviderProps,
} from "@ariakit/react/menu";
import { useStoreState } from "@ariakit/react/store";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { colors, radii, shadows, tokens } from "../tokens.stylex";
import { Popover } from "./popover";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

function MenuRoot(props: MenuProviderProps) {
  return <MenuProvider placement="bottom-start" {...props} />;
}

type MenuContentProps = StyleableProps<
  Omit<MenuProps, "alwaysVisible" | "render" | "unmountOnHide">
>;

function MenuContent({ style, ...props }: MenuContentProps) {
  const menu = useMenuContext();
  const mounted = useStoreState(menu, "mounted") ?? false;

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

function MenuItem({ style, ...props }: StyleableProps<MenuItemProps>) {
  return <AriakitMenuItem {...props} {...stylex.props(styles.item, style)} />;
}

function MenuDescription({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.description, style)} />;
}

export const Menu = Object.assign(MenuContent, {
  Root: MenuRoot,
  Trigger: MenuButton,
  Item: MenuItem,
  Description: MenuDescription,
});

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
    gap: "0.125rem",
    maxHeight: "var(--popover-available-height)",
    maxWidth: "min(20rem, var(--popover-available-width))",
    minWidth: "10rem",
    outline: "none",
    overflowY: "auto",
    padding: "0.25rem",
    zIndex: 50,
  },
  item: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ':is([data-active-item]):not([aria-disabled="true"])': colors.backgroundInteractive,
    },
    borderRadius: radii.compact,
    color: {
      default: colors.foregroundPrimary,
      ':is([aria-disabled="true"])': colors.foregroundDisabled,
    },
    display: "flex",
    flexShrink: 0,
    fontSize: tokens.fontSizeSmall,
    gap: "0.5rem",
    lineHeight: tokens.lineHeightSmall,
    minHeight: tokens.controlHeight,
    outline: "none",
    overflowWrap: "anywhere",
    paddingBlock: "0.375rem",
    paddingInline: "0.625rem",
  },
  description: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    overflowWrap: "anywhere",
    padding: "0.625rem",
  },
});
