import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { colors, tokens, textLayout } from "../tokens.stylex";
import { labelStyles } from "./label.stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

function FieldRoot({ style, ...props }: StyleableProps<RoleProps<"div">>) {
  return <Role.div {...props} {...stylex.props(styles.root, style)} />;
}

function FieldLabel({
  children,
  optional = false,
  style,
  ...props
}: StyleableProps<RoleProps<"label">> & { optional?: boolean }) {
  return (
    <Role.label {...props} {...stylex.props(labelStyles.label, style)}>
      {children}
      {optional && (
        <>
          {" "}
          <span {...stylex.props(labelStyles.optional)}>Optional</span>
        </>
      )}
    </Role.label>
  );
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
  description: {
    maxWidth: textLayout.descriptionMaxWidth,
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
    display: { default: "block", ":empty": "none" },
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
});
