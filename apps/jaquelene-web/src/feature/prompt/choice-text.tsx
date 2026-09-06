import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

const descriptionMaxLength = 180;

function summarizeDescription(description: string) {
  const normalized = description.replace(/\s+/gu, " ").trim();

  if (normalized.length <= descriptionMaxLength) {
    return normalized;
  }

  let end = descriptionMaxLength - 1;
  const lastCodeUnit = normalized.charCodeAt(end - 1);

  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    end -= 1;
  }

  return `${normalized.slice(0, end).trimEnd()}…`;
}

export function PromptChoiceText({
  title,
  description,
  descriptionId,
}: {
  title: string;
  description: string;
  descriptionId?: string;
}) {
  return (
    <span {...stylex.props(styles.text)}>
      <span {...stylex.props(styles.title)}>{title}</span>
      <span id={descriptionId} {...stylex.props(styles.description)}>
        {summarizeDescription(description)}
      </span>
    </span>
  );
}

const styles = stylex.create({
  text: { display: "block", minWidth: 0 },
  title: {
    display: "block",
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    color: {
      default: colors.foregroundSecondary,
      [stylex.when.ancestor('[aria-selected="true"]')]: colors.foregroundPrimary,
    },
    display: "-webkit-box",
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.125rem",
    overflow: "hidden",
    overflowWrap: "anywhere",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
});
