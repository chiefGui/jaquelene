import symbol from "@jaquelene/brand/symbol.svg";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "@jaquelene/ui/theme.stylex";

export function Home() {
  return (
    <main {...stylex.props(styles.root)}>
      <div aria-hidden="true" {...stylex.props(styles.atmosphere)} />

      <section aria-labelledby="introduction" {...stylex.props(styles.introduction)}>
        <div {...stylex.props(styles.copy)}>
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
        </div>
      </section>

      <div aria-hidden="true" {...stylex.props(styles.portrait)}>
        <div {...stylex.props(styles.portraitLight)} />
        <div {...stylex.props(styles.portraitFrame)}>
          <img alt="" draggable={false} src={symbol.src} {...stylex.props(styles.symbol)} />
        </div>
      </div>
    </main>
  );
}

const copyReveal = stylex.keyframes({
  from: {
    opacity: 0,
    transform: "translateY(1rem)",
  },
  to: {
    opacity: 1,
    transform: "translateY(0)",
  },
});

const portraitReveal = stylex.keyframes({
  from: {
    opacity: 0,
    transform: "translate3d(2rem, -50%, 0)",
  },
  to: {
    opacity: 1,
    transform: "translate3d(0, -50%, 0)",
  },
});

const styles = stylex.create({
  root: {
    backgroundColor: tokens.canvas,
    boxSizing: "border-box",
    color: tokens.foreground,
    isolation: "isolate",
    minHeight: "100svh",
    overflow: "hidden",
    paddingBlock: {
      default: "clamp(2rem, 5vw, 4.5rem)",
      "@media (max-width: 47.99rem)": "1.5rem",
    },
    paddingInline: {
      default: "clamp(2rem, 6vw, 7rem)",
      "@media (max-width: 47.99rem)": "1.5rem",
    },
    position: "relative",
  },
  atmosphere: {
    backgroundImage:
      "radial-gradient(circle at 77% 47%, oklch(0.44 0.075 18 / 20%), transparent 28%), radial-gradient(circle at 58% 15%, oklch(0.56 0.05 292 / 10%), transparent 34%), linear-gradient(115deg, transparent 45%, oklch(1 0 0 / 2.5%) 100%)",
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
    zIndex: -2,
  },
  introduction: {
    alignItems: "center",
    display: "flex",
    minHeight: {
      default: "calc(100svh - clamp(4rem, 10vw, 9rem))",
      "@media (max-width: 47.99rem)": "calc(100svh - 3rem)",
    },
    position: "relative",
    zIndex: 2,
  },
  copy: {
    animationDuration: "900ms",
    animationFillMode: "both",
    animationName: {
      default: copyReveal,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    maxWidth: {
      default: "min(42rem, 45vw)",
      "@media (max-width: 47.99rem)": "31rem",
    },
  },
  heading: {
    fontSize: {
      default: "clamp(4.5rem, 9vw, 9.5rem)",
      "@media (max-width: 47.99rem)": "clamp(4rem, 22vw, 6.5rem)",
    },
    fontWeight: 450,
    letterSpacing: "-0.075em",
    lineHeight: 0.82,
    margin: 0,
    textWrap: "balance",
  },
  pitch: {
    color: `color-mix(in oklab, ${tokens.foreground} 69%, transparent)`,
    fontSize: {
      default: "clamp(1rem, 1.25vw, 1.25rem)",
      "@media (max-width: 47.99rem)": "1.0625rem",
    },
    fontWeight: 400,
    letterSpacing: "-0.025em",
    lineHeight: 1.55,
    marginBlock: {
      default: "clamp(2rem, 4vw, 3.5rem) 0",
      "@media (max-width: 47.99rem)": "2rem 0",
    },
    maxWidth: "35rem",
  },
  release: {
    alignItems: "center",
    display: "flex",
    gap: "1.5rem",
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
  portrait: {
    animationDuration: "1100ms",
    animationFillMode: "both",
    animationName: {
      default: portraitReveal,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    aspectRatio: "430 / 450",
    maxWidth: "43rem",
    position: "absolute",
    right: {
      default: "clamp(-4rem, -2vw, -1rem)",
      "@media (max-width: 47.99rem)": "-25vw",
    },
    top: {
      default: "50%",
      "@media (max-width: 47.99rem)": "32%",
    },
    transform: "translateY(-50%)",
    width: {
      default: "min(46vw, 43rem)",
      "@media (max-width: 47.99rem)": "min(91vw, 35rem)",
    },
    zIndex: {
      default: 0,
      "@media (max-width: 47.99rem)": -1,
    },
  },
  portraitLight: {
    backgroundColor: "oklch(0.86 0.022 18 / 20%)",
    filter: "blur(4rem)",
    inset: "4%",
    position: "absolute",
    transform: "translate(8%, 3%)",
  },
  portraitFrame: {
    backgroundColor: "oklch(0.965 0.004 285)",
    boxShadow: "0 3rem 8rem oklch(0 0 0 / 42%)",
    inset: 0,
    opacity: {
      default: 1,
      "@media (max-width: 47.99rem)": 0.3,
    },
    overflow: "hidden",
    position: "absolute",
    "::after": {
      backgroundImage: "linear-gradient(145deg, transparent 58%, oklch(0.72 0.035 20 / 11%) 100%)",
      content: '""',
      inset: 0,
      pointerEvents: "none",
      position: "absolute",
    },
  },
  symbol: {
    display: "block",
    height: "100%",
    objectFit: "cover",
    opacity: 0.98,
    width: "100%",
  },
});
