import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";

export function UsageEmptyState() {
  return (
    <div {...stylex.props(styles.root)}>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 200 150"
        {...stylex.props(styles.illustration)}
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.25"
        >
          <g opacity="0.14" transform="translate(0 20)">
            <path d="M45 78 84 101c10 6 22 6 32 0l39-23" />
            <path d="M61 78 89 94c7 4 15 4 22 0l28-16" />
          </g>

          <g opacity="0.28" transform="translate(0 10)">
            <path d="M45 78 84 101c10 6 22 6 32 0l39-23" />
            <path d="M61 78 89 94c7 4 15 4 22 0l28-16" />
          </g>

          <path d="m45 78 39-23c10-6 22-6 32 0l39 23-39 23c-10 6-22 6-32 0L45 78Z" />
          <path opacity="0.58" d="m61 78 28-16c7-4 15-4 22 0l28 16-28 16c-7 4-15 4-22 0L61 78Z" />

          <path opacity="0.42" d="M61 68v-8M70 63V50M130 63V53M139 68V58" />

          <ellipse cx="100" cy="55" rx="23" ry="11.5" />
          <ellipse cx="100" cy="55" rx="16" ry="8" opacity="0.62" />
          <path d="M77 55v9c0 6.4 10.3 11.5 23 11.5s23-5.1 23-11.5v-9" />
          <path opacity="0.34" d="M84 79c9.8 5.7 22.2 5.7 32 0" />
        </g>
      </svg>

      <p {...stylex.props(styles.label)}>No usage yet</p>
    </div>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    justifyContent: "center",
  },
  illustration: {
    color: `color-mix(in oklab, ${tokens.foreground} 28%, ${tokens.muted})`,
    height: "9.375rem",
    width: "12.5rem",
  },
  label: {
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
});
