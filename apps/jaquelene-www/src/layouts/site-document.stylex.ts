import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  document: {
    backgroundColor: "#ffffff",
    color: "#111111",
    colorScheme: "light",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  },
  body: {
    margin: 0,
  },
});

export const documentClassNames = {
  body: stylex.props(styles.body).className,
  document: stylex.props(styles.document).className,
};
