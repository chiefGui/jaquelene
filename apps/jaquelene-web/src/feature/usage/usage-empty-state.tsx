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
          strokeWidth="2"
        >
          <path opacity="0.2" d="m28 101 66-38 78 45-66 38-78-45Z" />
          <path opacity="0.38" d="m28 101 78 45 66-38" />

          <g>
            <path d="m137 39 16 9-16 9-16-9 16-9Z" fill="currentColor" fillOpacity="0.12" />
            <path d="m121 48 16 9 16-9v53l-16 9-16-9V48Z" />
            <path opacity="0.42" d="M137 57v53M121 66l16 9 16-9M121 84l16 9 16-9" />
          </g>

          <g>
            <path d="m96 61 14 8-14 8-14-8 14-8Z" fill="currentColor" fillOpacity="0.12" />
            <path d="m82 69 14 8 14-8v42l-14 8-14-8V69Z" />
            <path opacity="0.42" d="M96 77v42M82 89l14 8 14-8" />
          </g>

          <g>
            <path d="m58 83 12 7-12 7-12-7 12-7Z" fill="currentColor" fillOpacity="0.12" />
            <path d="m46 90 12 7 12-7v15l-12 7-12-7V90Z" />
            <path opacity="0.42" d="M58 97v15" />
          </g>
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
    color: `color-mix(in oklab, ${tokens.foreground} 42%, ${tokens.muted})`,
    height: "9.375rem",
    width: "12.5rem",
  },
  label: {
    color: tokens.muted,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
});
