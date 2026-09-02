import * as stylex from "@stylexjs/stylex";
import symbolGeometryUrl from "@jaquelene/brand/symbol.svg?url";
import {
  symbolSquirclePath,
  symbolSquircleViewBox,
} from "@jaquelene/brand/symbol-squircle";
import { tokens } from "@jaquelene/ui/theme.stylex";

export const landingPitch =
  "Roleplay with AI in a beautiful, free & open source app.";

export function Home() {
  return (
    <main {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.symbolStage)}>
        <svg
          aria-hidden="true"
          shapeRendering="geometricPrecision"
          viewBox={symbolSquircleViewBox}
          {...stylex.props(styles.symbol)}
        >
          <defs>
            <radialGradient id="symbol-shadow" cx="28%" cy="18%" r="100%">
              <stop offset="0" stopColor={tokens.surfaceRaisedBorder} />
              <stop offset="0.47" stopColor={tokens.surface} />
              <stop offset="1" stopColor={tokens.canvas} />
            </radialGradient>
            <linearGradient id="symbol-face" x1="10%" x2="88%" y1="5%" y2="95%">
              <stop offset="0" stopColor={tokens.foreground} />
              <stop offset="1" stopColor={tokens.accent} />
            </linearGradient>
            <linearGradient id="symbol-sheen" x1="12%" x2="82%" y1="0" y2="100%">
              <stop offset="0" stopColor={tokens.foreground} stopOpacity="0.75" />
              <stop offset="0.28" stopColor={tokens.foreground} stopOpacity="0" />
              <stop offset="1" stopColor={tokens.foreground} stopOpacity="0.14" />
            </linearGradient>
            <clipPath id="symbol-squircle-clip">
              <path d={symbolSquirclePath} />
            </clipPath>
          </defs>
          <path d={symbolSquirclePath} fill="url(#symbol-face)" />
          <g clipPath="url(#symbol-squircle-clip)" fill="url(#symbol-shadow)">
            <use href={`${symbolGeometryUrl}#geometry`} />
          </g>
          <path d={symbolSquirclePath} fill="url(#symbol-sheen)" opacity="0.2" />
        </svg>
        <canvas
          aria-hidden="true"
          data-symbol-edge="idle"
          height={185}
          width={185}
          {...stylex.props(styles.symbolEdge)}
        />
      </div>

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
  symbolStage: {
    aspectRatio: "1",
    isolation: "isolate",
    position: "relative",
    width: "clamp(4.25rem, 6vw, 5.25rem)",
  },
  symbol: {
    display: "block",
    height: "100%",
    inset: 0,
    position: "absolute",
    width: "100%",
  },
  symbolEdge: {
    display: "block",
    height: "220%",
    left: "50%",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "220%",
  },
  heading: {
    color: tokens.foreground,
    fontSize: "clamp(3rem, 8vw, 5.75rem)",
    fontWeight: 450,
    letterSpacing: "-0.07em",
    lineHeight: 0.9,
    margin: 0,
  },
  pitch: {
    color: `color-mix(in oklab, ${tokens.foreground} 68%, ${tokens.canvas})`,
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
    color: `color-mix(in oklab, ${tokens.foreground} 82%, ${tokens.canvas})`,
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
      default: `color-mix(in oklab, ${tokens.reasoning} 35%, ${tokens.accent})`,
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
