import * as stylex from "@stylexjs/stylex";
import { tokens } from "@jaquelene/ui/theme.stylex";

export const landingPitch =
  "An app for roleplaying with AI. Beautiful, private, simple, free & open source.";

export function Home() {
  return (
    <main {...stylex.props(styles.root)}>
      <img
        alt=""
        draggable={false}
        height={84}
        src="/symbol-circle.svg"
        width={84}
        {...stylex.props(styles.symbol)}
      />

      <h1 {...stylex.props(styles.heading)}>jaquelene</h1>
      <p {...stylex.props(styles.pitch)}>{landingPitch}</p>
      <div {...stylex.props(styles.release)}>
        <span {...stylex.props(styles.status)}>
          <span aria-hidden="true" {...stylex.props(styles.statusDot)} />
          Soon.
        </span>
        <a href="https://github.com/chiefGui/jaquelene" {...stylex.props(styles.link)}>
          GitHub
          <span aria-hidden="true" {...stylex.props(styles.linkArrow)}>
            ↗
          </span>
        </a>
      </div>
    </main>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: tokens.canvas,
    boxSizing: "border-box",
    color: tokens.foreground,
    display: "flex",
    flexDirection: "column",
    gap: "clamp(1.5rem, 3vw, 2rem)",
    justifyContent: "center",
    minHeight: "100svh",
    padding: "clamp(1.5rem, 5vw, 3rem)",
    textAlign: "center",
  },
  symbol: {
    display: "block",
    height: "auto",
    width: "clamp(4.25rem, 6vw, 5.25rem)",
  },
  heading: {
    fontSize: "clamp(3rem, 8vw, 5.75rem)",
    fontWeight: 450,
    letterSpacing: "-0.07em",
    lineHeight: 0.9,
    margin: 0,
  },
  pitch: {
    color: `color-mix(in oklab, ${tokens.foreground} 68%, transparent)`,
    fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
    fontWeight: 400,
    letterSpacing: "-0.02em",
    lineHeight: 1.5,
    margin: 0,
    maxWidth: {
      default: "42rem",
      "@media (max-width: 32rem)": "32ch",
    },
    textWrap: "balance",
  },
  release: {
    alignItems: "center",
    display: "flex",
    gap: "1.5rem",
    justifyContent: "center",
  },
  status: {
    alignItems: "center",
    color: `color-mix(in oklab, ${tokens.foreground} 84%, transparent)`,
    display: "inline-flex",
    fontSize: "0.8125rem",
    fontWeight: 500,
    gap: "0.625rem",
    letterSpacing: "0.01em",
  },
  statusDot: {
    backgroundColor: tokens.accent,
    borderRadius: "50%",
    boxShadow: `0 0 1rem color-mix(in oklab, ${tokens.accent} 50%, transparent)`,
    height: "0.375rem",
    width: "0.375rem",
  },
  link: {
    alignItems: "center",
    color: {
      default: `color-mix(in oklab, ${tokens.foreground} 62%, transparent)`,
      ":hover": tokens.foreground,
    },
    display: "inline-flex",
    fontSize: "0.8125rem",
    fontWeight: 500,
    gap: "0.375rem",
    letterSpacing: "0.01em",
    minHeight: "1.5rem",
    outline: {
      default: "none",
      ":focus-visible": `0.125rem solid ${tokens.accent}`,
    },
    outlineOffset: "0.375rem",
    textDecoration: "none",
    transition: "color 180ms ease",
  },
  linkArrow: {
    fontSize: "0.9em",
    transform: "translateY(-0.05em)",
  },
});
