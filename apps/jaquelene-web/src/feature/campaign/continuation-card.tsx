import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { campaignContinuationQuery } from "./query";

const hoverBackground = `color-mix(in oklab, ${tokens.accent} 8%, ${tokens.surfaceRaised})`;
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
      <span {...stylex.props(styles.eyebrow)}>Continue campaign</span>
      <span {...stylex.props(styles.title)}>{continuation.scenarioTitle}</span>
    </Link>
  );
}

const styles = stylex.create({
  card: {
    backgroundColor: {
      default: tokens.surfaceRaised,
      ":hover": hoverBackground,
    },
    borderColor: tokens.surfaceRaisedBorder,
    borderRadius: tokens.radiusLarge,
    borderStyle: "solid",
    borderWidth: 1,
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
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.5rem",
    overflow: "hidden",
    textBox: "trim-both text",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
