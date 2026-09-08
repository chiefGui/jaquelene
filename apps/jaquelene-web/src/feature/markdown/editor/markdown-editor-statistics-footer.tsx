import { formatPluralizedCount } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useDeferredValue, useMemo } from "react";
import { countMarkdownDocument, type MarkdownStatistic } from "./markdown-editor-statistics";
import { useMarkdownEditorConfiguration, useMarkdownEditorDocument } from "./markdown-editor-root";

const labels = {
  lines: { singular: "line", plural: "lines", prefix: "" },
  words: { singular: "word", plural: "words", prefix: "" },
  characters: { singular: "character", plural: "characters", prefix: "" },
  estimatedTokens: { singular: "token", plural: "tokens", prefix: "≈ " },
} satisfies Record<MarkdownStatistic, { singular: string; plural: string; prefix: string }>;

function StatisticsContent({ metrics }: { metrics: readonly MarkdownStatistic[] }) {
  const { value } = useMarkdownEditorDocument("StatisticsFooter");
  const deferredValue = useDeferredValue(value);
  const statistics = useMemo(
    () => countMarkdownDocument(deferredValue, metrics),
    [deferredValue, metrics],
  );

  return (
    <div role="group" aria-label="Document statistics" {...stylex.props(styles.footer)}>
      <span {...stylex.props(styles.statistics)}>
        {statistics.map(({ id, count }, index) => {
          const label = labels[id];
          return (
            <span key={id} {...stylex.props(styles.metric)}>
              {index > 0 && <span aria-hidden="true">·</span>}
              <span>
                {label.prefix}
                {formatPluralizedCount(count, label.singular, label.plural)}
              </span>
            </span>
          );
        })}
      </span>
    </div>
  );
}

export function MarkdownEditorStatisticsFooter() {
  const { settings } = useMarkdownEditorConfiguration("StatisticsFooter");
  if (settings.statistics.length === 0) {
    return null;
  }
  return <StatisticsContent metrics={settings.statistics} />;
}

const styles = stylex.create({
  footer: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifyContent: "flex-end",
    minHeight: "2rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  statistics: {
    alignItems: "center",
    color: colors.foregroundDisabled,
    display: "inline-flex",
    flexWrap: "wrap",
    fontSize: tokens.fontSizeXXSmall,
    gap: "0.375rem",
    justifyContent: "flex-end",
    lineHeight: tokens.lineHeightXXSmall,
  },
  metric: { alignItems: "center", display: "inline-flex", gap: "0.375rem" },
});
