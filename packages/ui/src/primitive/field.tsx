import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { colors, tokens } from "../tokens.stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

function FieldRoot({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.root, style)} />;
}

function FieldLabel({ style, ...props }: StyleableProps<RoleProps<"label">>) {
  return <Role.label {...props} {...stylex.props(styles.label, style)} />;
}

function FieldDescription({ style, ...props }: StyleableProps<RoleProps<"p">>) {
  return <Role.p {...props} {...stylex.props(styles.description, style)} />;
}

function FieldControl({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.control, style)} />;
}

function FieldError({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.error, style)} />;
}

export const Field = {
  Root: FieldRoot,
  Label: FieldLabel,
  Description: FieldDescription,
  Control: FieldControl,
  Error: FieldError,
} as const;

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    minWidth: 0,
  },
  label: {
    color: colors.foregroundPrimary,
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
  },
  description: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  control: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.5rem",
    minWidth: 0,
  },
  error: {
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    minHeight: tokens.lineHeightXSmall,
  },
});
