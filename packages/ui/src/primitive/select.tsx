import {
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  ComboboxSelect,
  ComboboxSelectedValue,
  useComboboxContext,
  type ComboboxItemProps,
  type ComboboxPopoverProps,
  type ComboboxProviderProps,
  type ComboboxSelectProps,
} from "@ariakit/react/combobox";
import { useStoreState } from "@ariakit/react/store";
import ChevronDownIcon from "@hugeicons/core-free-icons/ChevronDownIcon";
import Tick01Icon from "@hugeicons/core-free-icons/Tick01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

import { colors, tokens } from "../tokens.stylex";
import { Popover } from "./popover";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

type SelectVariant = "filled" | "ghost";

export type SelectProps = StyleableProps<ComboboxSelectProps> & {
  variant?: SelectVariant;
};

function SelectRoot({ children, ...props }: ComboboxProviderProps<string>) {
  return (
    <ComboboxProvider selectOnMove={false} focusLoop placement="bottom-end" {...props}>
      {children}
    </ComboboxProvider>
  );
}

function SelectTrigger({ children, style, variant = "filled", ...props }: SelectProps) {
  return (
    <ComboboxSelect
      {...props}
      {...stylex.props(styles.trigger, styles[variant], style, stylex.defaultMarker())}
    >
      {children ?? <SelectValue />}
      <HugeiconsIcon
        icon={ChevronDownIcon}
        size={14}
        strokeWidth={1.5}
        aria-hidden="true"
        {...stylex.props(styles.chevron)}
      />
    </ComboboxSelect>
  );
}

type SelectValueProps = StyleableProps<ComponentProps<"span">> & { fallback?: string };

function SelectValue({ children, fallback, style, ...props }: SelectValueProps) {
  return (
    <span {...props} {...stylex.props(styles.value, style)}>
      {children ?? <ComboboxSelectedValue fallback={fallback ?? ""} />}
    </span>
  );
}

type SelectContentProps = StyleableProps<
  Omit<ComboboxPopoverProps, "alwaysVisible" | "render" | "sameWidth" | "unmountOnHide">
> & {
  width?: "content" | "trigger";
};

function SelectContent({ style, width = "trigger", ...props }: SelectContentProps) {
  const combobox = useComboboxContext();
  const mounted = useStoreState(combobox, "mounted") ?? false;

  return (
    <Popover.Presence present={mounted}>
      <ComboboxPopover
        portal
        gutter={8}
        sameWidth={width === "trigger"}
        {...props}
        alwaysVisible
        render={<Popover.Surface />}
        {...stylex.props(styles.content, width === "content" && styles.contentWidth, style)}
      />
    </Popover.Presence>
  );
}

function SelectItem({ style, ...props }: StyleableProps<ComboboxItemProps>) {
  return <ComboboxItem {...props} {...stylex.props(styles.item, style, stylex.defaultMarker())} />;
}

function SelectItemText({ style, ...props }: StyleableProps<ComponentProps<"span">>) {
  return <span {...props} {...stylex.props(styles.itemText, style)} />;
}

type SelectIndicatorProps = StyleableProps<Omit<ComponentProps<typeof HugeiconsIcon>, "icon">>;

function SelectIndicator({ style, ...props }: SelectIndicatorProps) {
  return (
    <HugeiconsIcon
      icon={Tick01Icon}
      size={16}
      strokeWidth={1.5}
      {...props}
      aria-hidden="true"
      {...stylex.props(styles.indicator, style)}
    />
  );
}

export const Select = Object.assign(SelectTrigger, {
  Root: SelectRoot,
  Value: SelectValue,
  Content: SelectContent,
  Item: SelectItem,
  ItemText: SelectItemText,
  Indicator: SelectIndicator,
});

const activeBackground = colors.backgroundAccentSubtle;
const controlShadow = `inset 0 0.0625rem 0 color-mix(in oklch, ${colors.foregroundPrimary} 5%, transparent), 0 0.0625rem 0.125rem color-mix(in oklch, ${colors.backgroundCanvas} 45%, transparent)`;
const focusRing = `inset 0 0 0 1px ${colors.borderFocus}`;
const focusedControlShadow = `${focusRing}, ${controlShadow}`;

const styles = stylex.create({
  trigger: {
    alignItems: "center",
    borderRadius: tokens.radiusLarge,
    color: {
      default: colors.foregroundSecondary,
      ":not(:disabled):hover": colors.foregroundPrimary,
      ':is([aria-expanded="true"])': colors.foregroundPrimary,
      ":is([data-focus-visible])": colors.foregroundPrimary,
    },
    display: "inline-flex",
    flexShrink: 0,
    fontSize: tokens.fontSizeSmall,
    gap: "0.75rem",
    height: tokens.controlHeight,
    justifyContent: "space-between",
    lineHeight: tokens.lineHeightSmall,
    opacity: {
      default: 1,
      ":disabled": 0.5,
    },
    outline: "none",
    paddingInline: "0.625rem",
  },
  filled: {
    backgroundColor: {
      default: colors.backgroundNeutralSubtlest,
      ":not(:disabled):hover": activeBackground,
    },
    borderColor: colors.borderDefault,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: {
      default: controlShadow,
      ':is([aria-expanded="true"])': focusedControlShadow,
      ":is([data-focus-visible])": focusedControlShadow,
    },
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": activeBackground,
      ':is([aria-expanded="true"])': activeBackground,
    },
    boxShadow: {
      default: null,
      ':is([aria-expanded="true"])': focusRing,
      ":is([data-focus-visible])": focusRing,
    },
  },
  chevron: {
    color: {
      default: colors.foregroundSecondary,
      [stylex.when.ancestor("[data-focus-visible]")]: colors.foregroundAccent,
      [stylex.when.ancestor('[aria-expanded="true"]')]: colors.foregroundAccent,
    },
    flexShrink: 0,
    height: "0.875rem",
    transform: {
      default: null,
      [stylex.when.ancestor("[data-focus-visible]")]: "rotate(-90deg)",
      [stylex.when.ancestor('[aria-expanded="true"]')]: "rotate(-90deg)",
    },
    width: "0.875rem",
  },
  value: {
    minWidth: 0,
    textBox: "trim-both text",
  },
  content: {
    backgroundColor: colors.backgroundSurfaceOverlay,
    borderColor: colors.borderOverlay,
    borderRadius: tokens.radiusXLarge,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowXLarge,
    color: colors.foregroundPrimary,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    outline: "none",
    overflow: "hidden",
    padding: "0.25rem",
    zIndex: 50,
  },
  contentWidth: {
    minWidth: "var(--popover-anchor-width)",
    whiteSpace: "nowrap",
  },
  item: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":focus": activeBackground,
      ":hover": activeBackground,
      ":is([data-active-item])": activeBackground,
      ':is([aria-selected="true"])': colors.backgroundSelected,
      ':is([aria-selected="true"]):hover': colors.backgroundSelectedHover,
    },
    borderRadius: tokens.radiusMedium,
    color: {
      default: colors.foregroundSecondary,
      ":focus": colors.foregroundPrimary,
      ":hover": colors.foregroundPrimary,
      ':is([aria-selected="true"])': colors.foregroundPrimary,
      ":is([data-active-item])": colors.foregroundPrimary,
    },
    display: "flex",
    fontSize: tokens.fontSizeSmall,
    gap: "0.75rem",
    height: tokens.controlHeight,
    justifyContent: "space-between",
    lineHeight: tokens.lineHeightSmall,
    outline: "none",
    paddingInline: "0.625rem",
  },
  itemText: {
    minWidth: 0,
    textBox: "trim-both text",
  },
  indicator: {
    color: colors.foregroundAccent,
    flexShrink: 0,
    height: "1rem",
    opacity: {
      default: 0,
      [stylex.when.ancestor('[aria-selected="true"]')]: 1,
    },
    width: "1rem",
  },
});
