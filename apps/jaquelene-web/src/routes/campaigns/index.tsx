import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import Book01Icon from "@hugeicons/core-free-icons/Book01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, formatTimestamp } from "@jaquelene/ui";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { campaignPagesQuery } from "@/feature/campaign/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/campaigns/")({ component: CampaignsIndexRoute });

function CampaignsIndexRoute() {
  const pages = useSuspenseInfiniteQuery(campaignPagesQuery);
  const campaigns = pages.data.pages.flatMap((page) => page.campaigns);

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Campaigns</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body style={styles.page}>
          <section aria-labelledby="campaigns-heading">
            <h1 id="campaigns-heading" {...stylex.props(styles.title)}>
              Campaigns
            </h1>

            <div {...stylex.props(styles.grid)}>
              <Link to="/campaigns/new" {...stylex.props(styles.card, styles.createCard)}>
                <HugeiconsIcon
                  icon={Add01Icon}
                  size={20}
                  color="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                  {...stylex.props(styles.icon)}
                />
                <span {...stylex.props(styles.cardLabel)}>Start campaign</span>
              </Link>

              {campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  to="/campaigns/$campaignId"
                  params={{ campaignId: campaign.id }}
                  {...stylex.props(styles.card)}
                >
                  <HugeiconsIcon
                    icon={Book01Icon}
                    size={20}
                    color="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                    {...stylex.props(styles.icon)}
                  />
                  <span>
                    <span {...stylex.props(styles.cardLabel)}>{campaign.title}</span>
                    <time
                      dateTime={new Date(campaign.startedAt).toISOString()}
                      {...stylex.props(styles.timestamp)}
                    >
                      {formatTimestamp(campaign.startedAt)}
                    </time>
                  </span>
                </Link>
              ))}
            </div>

            {pages.hasNextPage ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pages.isFetchingNextPage}
                onClick={() => void pages.fetchNextPage()}
                style={styles.loadMore}
              >
                {pages.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const cardHoverBackground = colors.backgroundNeutralSubtler;
const styles = stylex.create({
  page: { minWidth: 0 },
  title: {
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    letterSpacing: "-0.025em",
    lineHeight: tokens.lineHeightLarge,
  },
  grid: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
    marginTop: "1.25rem",
  },
  card: {
    alignItems: "flex-start",
    backgroundColor: { default: "transparent", ":hover": cardHoverBackground },
    borderColor: colors.borderSubtle,
    borderRadius: radii.content,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.foregroundPrimary,
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    justifyContent: "space-between",
    minHeight: "7.5rem",
    minWidth: 0,
    outlineColor: { default: null, ":focus-visible": colors.focusRing },
    outlineOffset: { default: null, ":focus-visible": 2 },
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 1 },
    overflow: "hidden",
    padding: "1rem",
    textAlign: "start",
    width: "100%",
  },
  createCard: { borderStyle: "dashed" },
  icon: { color: colors.foregroundSecondary, flexShrink: 0 },
  cardLabel: {
    display: "block",
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  timestamp: {
    color: colors.foregroundSecondary,
    display: "block",
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.25rem",
  },
  loadMore: { marginBlockStart: "1rem" },
});
