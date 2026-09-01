import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { createContext, useContext } from "react";
import { colors, tokens } from "../tokens.stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

const ItemGroupContext = createContext(false);

function ItemSection({ style, ...props }: StyleableProps<RoleProps<"section">>) {
  return <Role.section {...props} {...stylex.props(styles.section, style)} />;
}

function ItemSectionHeader({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.sectionHeader, style)} />;
}

function ItemHeading({ style, ...props }: StyleableProps<RoleProps<"h2">>) {
  return <Role.h2 {...props} {...stylex.props(styles.heading, style)} />;
}

function ItemSectionDescription({ style, ...props }: StyleableProps<RoleProps<"p">>) {
  return <Role.p {...props} {...stylex.props(styles.sectionDescription, style)} />;
}

function ItemGroup({ children, style, ...props }: StyleableProps<RoleProps<"div">>) {
  return (
    <ItemGroupContext.Provider value={true}>
      <Role.div {...props} {...stylex.props(styles.group, style)}>
        {children}
      </Role.div>
    </ItemGroupContext.Provider>
  );
}

function ItemRoot({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  const grouped = useContext(ItemGroupContext);
  return <Role.div {...props} {...stylex.props(styles.root, grouped && styles.groupItem, style)} />;
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
  },
  heading: {
    color: colors.foreground,
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
    paddingInline: "1rem",
    textBox: "trim-both text",
  },
  sectionDescription: {
    color: colors.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    margin: 0,
    paddingInline: "1rem",
    textBox: "trim-both text",
  },
  group: {
    backgroundColor: `color-mix(in oklab, ${colors.foreground} 2%, transparent)`,
    borderColor: colors.border,
    borderRadius: tokens.radiusXLarge,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  root: {
    alignItems: "center",
    display: "flex",
    gap: "2rem",
    justifyContent: "space-between",
    minHeight: "3.5rem",
    padding: "1rem",
  },
  groupItem: {
    borderColor: colors.border,
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
    color: colors.foreground,
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
    textBox: "trim-both text",
  },
  description: {
    color: colors.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.25rem",
  },
  value: {
    color: `color-mix(in oklab, ${colors.foreground} 75%, transparent)`,
    flexShrink: 0,
    fontSize: tokens.fontSizeSmall,
    fontVariantNumeric: "tabular-nums",
    lineHeight: tokens.lineHeightSmall,
  },
  valueText: {
    textBox: "trim-both text",
  },
});
