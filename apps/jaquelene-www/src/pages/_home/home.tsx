import symbol from "@jaquelene/brand/symbol.svg";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "@jaquelene/ui/theme.stylex";

export function Home() {
  return (
    <main {...stylex.props(styles.root)}>
      <div aria-hidden="true" {...stylex.props(styles.atmosphere)} />

      <section aria-labelledby="introduction" {...stylex.props(styles.introduction)}>
        <div {...stylex.props(styles.symbolFrame)}>
          <img
            alt=""
            draggable={false}
            height={symbol.height}
            src={symbol.src}
            width={symbol.width}
            {...stylex.props(styles.symbol)}
          />
        </div>

        <h1 id="introduction" {...stylex.props(styles.heading)}>
          jaquelene
        </h1>
        <p {...stylex.props(styles.pitch)}>
          An easy, beautiful, modern and opinionated LLM frontend for everyone, crafted for
          roleplay.
        </p>
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
      </section>
    </main>
  );
}

const reveal = stylex.keyframes({
  from: {
    opacity: 0,
    transform: "translateY(0.75rem)",
  },
  to: {
    opacity: 1,
    transform: "translateY(0)",
  },
});

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: tokens.canvas,
    boxSizing: "border-box",
    color: tokens.foreground,
    display: "flex",
    justifyContent: "center",
    minHeight: "100svh",
    overflow: "hidden",
    padding: {
      default: "3rem",
      "@media (max-width: 47.99rem)": "1.5rem",
    },
    position: "relative",
  },
  atmosphere: {
    backgroundImage:
      "radial-gradient(circle at 50% 46%, oklch(0.4 0.065 18 / 14%), transparent min(30rem, 52vw))",
    inset: "-20%",
    pointerEvents: "none",
    position: "absolute",
  },
  introduction: {
    alignItems: "center",
    animationDuration: "850ms",
    animationFillMode: "both",
    animationName: {
      default: reveal,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    display: "flex",
    flexDirection: "column",
    maxWidth: "40rem",
    position: "relative",
    textAlign: "center",
    width: "100%",
  },
  symbolFrame: {
    backgroundColor: "oklch(0.965 0.004 285)",
    boxShadow: "0 1.5rem 5rem oklch(0 0 0 / 36%)",
    overflow: "hidden",
    width: "clamp(4.25rem, 6vw, 5.25rem)",
  },
  symbol: {
    display: "block",
    height: "auto",
    width: "100%",
  },
  heading: {
    fontSize: "clamp(3.5rem, 8vw, 5.75rem)",
    fontWeight: 450,
    letterSpacing: "-0.07em",
    lineHeight: 0.9,
    margin: "2rem 0 0",
  },
  pitch: {
    color: `color-mix(in oklab, ${tokens.foreground} 68%, transparent)`,
    fontSize: "clamp(1rem, 1.5vw, 1.125rem)",
    fontWeight: 400,
    letterSpacing: "-0.02em",
    lineHeight: 1.55,
    margin: "1.75rem 0 0",
    maxWidth: "34rem",
  },
  release: {
    alignItems: "center",
    display: "flex",
    gap: "1.5rem",
    justifyContent: "center",
    marginTop: "2rem",
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
