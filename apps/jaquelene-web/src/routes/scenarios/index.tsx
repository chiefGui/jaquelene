import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import Book01Icon from "@hugeicons/core-free-icons/Book01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { scenariosQuery } from "@/feature/scenario/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

const cardHoverBackground = colors.backgroundNeutralSubtler;

export const Route = createFileRoute("/scenarios/")({
  component: ScenariosIndexRoute,
});

function ScenariosIndexRoute() {
  const { data: scenarios } = useSuspenseQuery(scenariosQuery);

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Scenarios</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body style={styles.page}>
          <section aria-labelledby="scenarios-heading">
            <h1 id="scenarios-heading" {...stylex.props(styles.title)}>
              Scenarios
            </h1>

            <div {...stylex.props(styles.grid)}>
              <Link to="/scenarios/new" {...stylex.props(styles.card, styles.createCard)}>
                <HugeiconsIcon
                  icon={Add01Icon}
                  size={20}
                  color="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                  {...stylex.props(styles.icon)}
                />
                <span {...stylex.props(styles.cardLabel)}>Create scenario</span>
              </Link>

              {scenarios.map((scenario) => (
                <Link
                  key={scenario.id}
                  to="/scenarios/$scenarioId"
                  params={{ scenarioId: scenario.id }}
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
                  <span {...stylex.props(styles.cardLabel)}>{scenario.title}</span>
                </Link>
              ))}
            </div>
          </section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  page: {
    minWidth: 0,
  },
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
    backgroundColor: {
      default: "transparent",
      ":hover": cardHoverBackground,
    },
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
    outlineColor: {
      default: null,
      ":focus-visible": colors.focusRing,
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
    overflow: "hidden",
    padding: "1rem",
    textAlign: "start",
    width: "100%",
  },
  createCard: {
    borderStyle: "dashed",
  },
  icon: {
    color: colors.foregroundSecondary,
    flexShrink: 0,
  },
  cardLabel: {
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
