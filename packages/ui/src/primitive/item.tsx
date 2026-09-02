import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { createContext, useContext } from "react";
import { colors, radii, tokens } from "../tokens.stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

type ItemGroupVariant = "connected" | "separated";

type ItemGroupProps = StyleableProps<RoleProps<"div">> & {
  variant?: ItemGroupVariant;
};

const ItemGroupContext = createContext<ItemGroupVariant | null>(null);

function ItemSection({ style, ...props }: StyleableProps<RoleProps<"section">>) {
  return <Role.section {...props} {...stylex.props(styles.section, style)} />;
}

function ItemSectionHeader({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.sectionHeader, style)} />;
}

function ItemSectionContent({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.sectionContent, style)} />;
}

function ItemHeading({ style, ...props }: StyleableProps<RoleProps<"h2">>) {
  return <Role.h2 {...props} {...stylex.props(styles.heading, style)} />;
}

function ItemSectionDescription({ style, ...props }: StyleableProps<RoleProps<"p">>) {
  return <Role.p {...props} {...stylex.props(styles.sectionDescription, style)} />;
}

function ItemGroup({ children, style, variant = "connected", ...props }: ItemGroupProps) {
  return (
    <ItemGroupContext.Provider value={variant}>
      <Role.div {...props} {...stylex.props(groupStyles[variant], style)}>
        {children}
      </Role.div>
    </ItemGroupContext.Provider>
  );
}

function ItemRoot({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  const groupVariant = useContext(ItemGroupContext);
  return (
    <Role.div
      {...props}
      {...stylex.props(styles.root, groupVariant && groupItemStyles[groupVariant], style)}
    />
  );
}

function ItemContent({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.content, style)} />;
}

function ItemLabel({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.label, style)} />;
}

function ItemDescription({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.description, style)} />;
}

function ItemValue({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.value, style)} />;
}

function ItemValueText({ style, ...props }: StyleableProps<RoleProps<"span">>) {
  return <Role.span {...props} {...stylex.props(styles.valueText, style)} />;
}

export const Item = {
  Section: ItemSection,
  SectionHeader: ItemSectionHeader,
  SectionContent: ItemSectionContent,
  Heading: ItemHeading,
  SectionDescription: ItemSectionDescription,
  Group: ItemGroup,
  Root: ItemRoot,
  Content: ItemContent,
  Label: ItemLabel,
  Description: ItemDescription,
  Value: ItemValue,
  ValueText: ItemValueText,
} as const;

const styles = stylex.create({
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  sectionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    paddingInline: "1rem",
  },
  sectionContent: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    minWidth: 0,
  },
  heading: {
    color: colors.foregroundPrimary,
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
    textBox: "trim-both text",
  },
  sectionDescription: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    margin: 0,
    textBox: "trim-both text",
  },
  groupSurface: {
    backgroundColor: colors.backgroundNeutralSubtlest,
    borderColor: colors.borderSubtle,
    borderRadius: radii.surface,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  groupSeparated: {
    display: "grid",
    gap: "0.75rem",
  },
  root: {
    alignItems: "center",
    display: "flex",
    gap: "2rem",
    justifyContent: "space-between",
    minHeight: "3.5rem",
    paddingBlock: "0.75rem",
    paddingInline: "1rem",
  },
  groupItemConnected: {
    borderColor: colors.borderSubtle,
    borderStyle: "solid",
    borderTopWidth: {
      default: 0,
      ":not(:first-child)": 1,
    },
  },
  content: {
    minWidth: 0,
  },
  label: {
    color: colors.foregroundPrimary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    textBox: "trim-both text",
  },
  description: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.25rem",
  },
  value: {
    color: colors.foregroundSecondary,
    flexShrink: 0,
    fontSize: tokens.fontSizeSmall,
    fontVariantNumeric: "tabular-nums",
    lineHeight: tokens.lineHeightSmall,
  },
  valueText: {
    textBox: "trim-both text",
  },
});

const groupStyles = {
  connected: styles.groupSurface,
  separated: styles.groupSeparated,
} satisfies Record<ItemGroupVariant, StyleXStyles>;

const groupItemStyles = {
  connected: styles.groupItemConnected,
  separated: styles.groupSurface,
} satisfies Record<ItemGroupVariant, StyleXStyles>;
