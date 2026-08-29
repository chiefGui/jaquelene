import * as stylex from "@stylexjs/stylex";
import { tokens } from "@jaquelene/ui/theme.stylex";

const styles = stylex.create({
  document: {
    backgroundColor: tokens.canvas,
    color: tokens.foreground,
    colorScheme: "dark",
    fontFamily: tokens.fontGeist,
  },
  body: {
    margin: 0,
    minWidth: "20rem",
  },
});

export const documentClassNames = {
  body: stylex.props(styles.body).className,
  document: stylex.props(styles.document).className,
};
