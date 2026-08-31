import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { campaignContinuationQuery } from "./query";

const background = `color-mix(in oklab, ${tokens.accent} 8%, transparent)`;
const hoverBackground = `color-mix(in oklab, ${tokens.accent} 12%, transparent)`;
const focusColor = `color-mix(in oklab, ${tokens.accent} 60%, transparent)`;

export function CampaignContinuationCard() {
  const { data: continuation } = useSuspenseQuery(campaignContinuationQuery);
  const matchRoute = useMatchRoute();

  if (
    !continuation ||
    matchRoute({
      to: "/campaigns/$campaignId",
      params: { campaignId: continuation.campaignId },
    })
  ) {
    return null;
  }

  return (
    <Link
      to="/campaigns/$campaignId"
      params={{ campaignId: continuation.campaignId }}
      preload="intent"
      {...stylex.props(styles.card)}
    >
      <span {...stylex.props(styles.eyebrow)}>Continue last campaign</span>
      <span {...stylex.props(styles.title)}>{continuation.scenarioTitle}</span>
    </Link>
  );
}

const styles = stylex.create({
  card: {
    backgroundColor: {
      default: background,
      ":hover": hoverBackground,
    },
    borderRadius: tokens.radiusLarge,
    color: tokens.foreground,
    display: "block",
    flexShrink: 0,
    marginBlockEnd: "0.75rem",
    marginInline: "0.5rem",
    minWidth: 0,
    outlineColor: {
      default: null,
      ":focus-visible": focusColor,
    },
    outlineOffset: {
      default: null,
      ":focus-visible": 2,
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: {
      default: null,
      ":focus-visible": 1,
    },
    padding: "0.75rem",
    textAlign: "start",
  },
  eyebrow: {
    color: tokens.muted,
    display: "block",
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    textBox: "trim-both text",
  },
  title: {
    display: "block",
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.25rem",
    overflow: "hidden",
    textBox: "trim-both text",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
