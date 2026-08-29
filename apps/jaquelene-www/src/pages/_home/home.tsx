import * as stylex from "@stylexjs/stylex";

export function Home() {
  return (
    <main {...stylex.props(styles.root)}>
      <h1 {...stylex.props(styles.heading)}>Jaquelene</h1>
    </main>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "center",
    minHeight: "100svh",
    padding: "2rem",
  },
  heading: {
    fontSize: "clamp(2rem, 8vw, 6rem)",
    fontWeight: 500,
    letterSpacing: "-0.05em",
    lineHeight: 1,
    margin: 0,
  },
});
