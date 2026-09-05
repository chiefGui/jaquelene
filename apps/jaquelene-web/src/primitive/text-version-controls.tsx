import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { IconAction } from "./icon-action";

export function TextVersionControls({
  count,
  disabled = false,
  index,
  onNext,
  onPrevious,
}: {
  count: number;
  disabled?: boolean;
  index: number;
  onNext: () => void;
  onPrevious: () => void;
}) {
  if (count < 2) {
    return null;
  }

  return (
    <div role="group" aria-label="Text versions" {...stylex.props(styles.root)}>
      <IconAction
        icon={ArrowLeft01Icon}
        label="Previous version"
        accessibleWhenDisabled
        disabled={disabled || index === 0}
        onClick={onPrevious}
      />
      <span role="status" {...stylex.props(styles.number)}>
        <VisuallyHidden>
          Version {index + 1} of {count}
        </VisuallyHidden>
        <span aria-hidden="true">
          {index + 1} / {count}
        </span>
      </span>
      <IconAction
        icon={ArrowRight01Icon}
        label="Next version"
        accessibleWhenDisabled
        disabled={disabled || index === count - 1}
        onClick={onNext}
      />
    </div>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.125rem",
  },
  number: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    fontVariantNumeric: "tabular-nums",
    lineHeight: tokens.lineHeightXSmall,
    minWidth: "5ch",
    textAlign: "center",
  },
});
