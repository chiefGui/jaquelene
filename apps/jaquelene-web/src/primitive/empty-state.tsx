import { Role, type RoleProps } from "@ariakit/react/role";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

function EmptyStateRoot({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.root, style)} />;
}

function EmptyStateTitle({ style, ...props }: StyleableProps<RoleProps<"h2">>) {
  return <Role.h2 {...props} {...stylex.props(styles.title, style)} />;
}

function EmptyStateDescription({ style, ...props }: StyleableProps<RoleProps<"p">>) {
  return <Role.p {...props} {...stylex.props(styles.description, style)} />;
}

export const EmptyState = {
  Root: EmptyStateRoot,
  Title: EmptyStateTitle,
  Description: EmptyStateDescription,
} as const;

const styles = stylex.create({
  root: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    maxWidth: "24rem",
    textAlign: "left",
    width: "100%",
  },
  title: {
    color: colors.foregroundPrimary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    textBox: "trim-both text",
  },
  description: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    textBox: "trim-both text",
  },
});
