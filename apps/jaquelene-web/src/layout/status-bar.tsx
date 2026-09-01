import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";

export function StatusBar() {
  return (
    <footer aria-label="Status bar" {...stylex.props(styles.root)}>
      <span role="status" {...stylex.props(styles.text)}>
        Ready
      </span>
    </footer>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    color: tokens.muted,
    display: "flex",
    fontSize: tokens.fontSizeXSmall,
    gridColumn: 2,
    gridRow: 2,
    justifyContent: "flex-end",
    lineHeight: tokens.lineHeightXSmall,
    minWidth: 0,
    paddingInline: "0.75rem",
  },
  text: {
    textBox: "trim-both text",
  },
});
