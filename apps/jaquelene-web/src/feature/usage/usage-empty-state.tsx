import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { EmptyState } from "@/primitive/empty-state";

const columnHalfWidth = 15;
const columnDepth = 9;
const cornerX = 3;
const cornerY = 1.8;

type UsageColumnProps = Readonly<{
  x: number;
  y: number;
  height: number;
}>;

function UsageColumn({ x, y, height }: UsageColumnProps) {
  const left = x - columnHalfWidth;
  const right = x + columnHalfWidth;
  const shoulderTop = y + columnDepth;
  const frontTop = y + 2 * columnDepth;
  const shoulderBottom = shoulderTop + height;
  const frontBottom = frontTop + height;

  const body = [
    `M${left} ${shoulderTop}`,
    `L${x} ${frontTop}`,
    `L${right} ${shoulderTop}`,
    `L${right} ${shoulderBottom}`,
    `L${x} ${frontBottom}`,
    `L${left} ${shoulderBottom}Z`,
  ].join(" ");
  const sides = [
    `M${left} ${shoulderTop}`,
    `L${left} ${shoulderBottom - cornerY}`,
    `Q${left} ${shoulderBottom} ${left + cornerX} ${shoulderBottom + cornerY}`,
    `L${x - cornerX} ${frontBottom - cornerY}`,
    `Q${x} ${frontBottom} ${x + cornerX} ${frontBottom - cornerY}`,
    `L${right - cornerX} ${shoulderBottom + cornerY}`,
    `Q${right} ${shoulderBottom} ${right} ${shoulderBottom - cornerY}`,
    `L${right} ${shoulderTop}`,
    `M${x} ${frontTop}L${x} ${frontBottom}`,
  ].join(" ");
  const top = [
    `M${x + cornerX} ${y + cornerY}`,
    `L${right - cornerX} ${shoulderTop - cornerY}`,
    `Q${right} ${shoulderTop} ${right - cornerX} ${shoulderTop + cornerY}`,
    `L${x + cornerX} ${frontTop - cornerY}`,
    `Q${x} ${frontTop} ${x - cornerX} ${frontTop - cornerY}`,
    `L${left + cornerX} ${shoulderTop + cornerY}`,
    `Q${left} ${shoulderTop} ${left + cornerX} ${shoulderTop - cornerY}`,
    `L${x - cornerX} ${y + cornerY}`,
    `Q${x} ${y} ${x + cornerX} ${y + cornerY}Z`,
  ].join(" ");

  return (
    <>
      <path d={body} fill={tokens.canvas} stroke="none" />
      <path d={sides} strokeOpacity="0.58" />
      <path d={top} fill={tokens.canvas} strokeOpacity="0.95" />
    </>
  );
}

export function UsageEmptyState() {
  return (
    <EmptyState.Root>
      <EmptyState.Illustration>
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="8 0 166 180"
          {...stylex.props(styles.illustration)}
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          >
            <path d="M10 109v8q0 3 7 7l75 42q7 4 14 0l58-34q7-4 7-11v-4" strokeOpacity="0.34" />
            <path
              d="M89 71l75 42q7 4 0 8l-58 34q-7 4-14 0l-75-42q-7-4 0-8l58-34q7-4 14 0Z"
              fill={tokens.canvas}
              strokeOpacity="0.48"
            />

            <UsageColumn x={139} y={13} height={96} />
            <UsageColumn x={106} y={37} height={80} />
            <UsageColumn x={73} y={61} height={64} />
            <UsageColumn x={40} y={85} height={47} />
          </g>
        </svg>
      </EmptyState.Illustration>

      <EmptyState.Content>
        <EmptyState.Title>No usage yet</EmptyState.Title>
        <EmptyState.Description>
          As you interact with AI, token and cost activity will appear here.
        </EmptyState.Description>
      </EmptyState.Content>
    </EmptyState.Root>
  );
}

const styles = stylex.create({
  illustration: {
    height: "9.375rem",
    width: "8.625rem",
  },
});
