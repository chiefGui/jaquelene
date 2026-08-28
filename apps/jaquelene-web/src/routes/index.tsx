import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/")({
  component: HomeRoute,
});

function HomeRoute() {
  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>
              <Breadcrumb.Page>Home</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport style={styles.viewport}>
        <h1 {...stylex.props(styles.heading)}>Hello world</h1>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  viewport: {
    display: "grid",
    placeItems: "center",
  },
  heading: {
    fontSize: tokens.fontSizeSmall,
    fontWeight: 500,
    lineHeight: tokens.lineHeightSmall,
  },
});
