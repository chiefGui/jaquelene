import { Role, type RoleProps } from "@ariakit/react/role";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { colors, tokens } from "../tokens.stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

type FormStatusTone = "danger" | "neutral";

type FormStatusProps = StyleableProps<RoleProps<"div">> & {
  tone?: FormStatusTone;
};

function FormRoot({ style, ...props }: StyleableProps<RoleProps<"form">>) {
  return <Role.form {...props} {...stylex.props(styles.root, style)} />;
}

function FormStatus({ style, tone = "neutral", ...props }: FormStatusProps) {
  return (
    <Role.div
      {...props}
      {...stylex.props(styles.status, tone === "danger" && styles.statusDanger, style)}
    />
  );
}

export const Form = {
  Root: FormRoot,
  Status: FormStatus,
} as const;

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    minWidth: 0,
  },
  status: {
    color: colors.foregroundSecondary,
    display: { default: "block", ":empty": "none" },
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  statusDanger: {
    color: colors.foregroundDanger,
  },
});
