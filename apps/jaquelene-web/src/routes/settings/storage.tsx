import { Storage, type StorageUsage } from "@jaquelene/ipc/renderer";
import { Button, Item, formatBytes } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { requireIpcMethod } from "@/ipc";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

const measureStorageUsage = requireIpcMethod(Storage?.measureUsage);

export const Route = createFileRoute("/settings/storage")({
  loader: {
    handler: measureStorageUsage,
    staleReloadMode: "blocking",
  },
  staleTime: 0,
  onError: (error) => console.error("Could not measure storage usage.", error),
  errorComponent: StorageRouteError,
  component: StorageRoute,
});

type StorageCategory = {
  id: string;
  label: string;
  description: string;
  bytes: number;
  color: StyleXStyles;
};

function getStorageCategories({
  userContentBytes,
  applicationDataBytes,
}: StorageUsage): readonly StorageCategory[] {
  return [
    {
      id: "user-content",
      label: "Content",
      description: "Scenarios, campaigns, and threads",
      bytes: userContentBytes,
      color: styles.userContent,
    },
    {
      id: "application-data",
      label: "App data",
      description: "Preferences, favorites, and connections",
      bytes: applicationDataBytes,
      color: styles.applicationData,
    },
  ];
}

function StorageHeader() {
  return (
    <ContentPane.Header>
      <Breadcrumb.Root>
        <Breadcrumb.List>
          <Breadcrumb.Item>Settings</Breadcrumb.Item>
          <Breadcrumb.Separator />
          <Breadcrumb.Item>
            <Breadcrumb.Page>Storage</Breadcrumb.Page>
          </Breadcrumb.Item>
        </Breadcrumb.List>
      </Breadcrumb.Root>
    </ContentPane.Header>
  );
}

function StorageUsageBar({
  categories,
  totalBytes,
}: {
  categories: readonly StorageCategory[];
  totalBytes: number;
}) {
  const visibleCategories = categories.filter(({ bytes }) => bytes > 0);

  if (visibleCategories.length < 2) {
    return null;
  }

  return (
    <div aria-hidden="true" {...stylex.props(styles.usageBar)}>
      {visibleCategories.map((category) => (
        <span
          key={category.id}
          {...stylex.props(styles.usageSegment, category.color)}
          style={{ inlineSize: `${(category.bytes / totalBytes) * 100}%` }}
        />
      ))}
    </div>
  );
}

function StorageRouteError() {
  const router = useRouter();

  return (
    <>
      <StorageHeader />

      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Section aria-labelledby="storage-error-heading">
            <Item.Heading id="storage-error-heading">Usage</Item.Heading>

            <Item.Group>
              <Item.Root>
                <Item.Label>Couldn’t measure storage</Item.Label>
                <Button onClick={() => void router.invalidate()}>Retry</Button>
              </Item.Root>
            </Item.Group>
          </Item.Section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

function StorageRoute() {
  const usage = Route.useLoaderData();
  const categories = getStorageCategories(usage);
  const totalBytes = categories.reduce((total, category) => total + category.bytes, 0);

  return (
    <>
      <StorageHeader />

      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Section aria-labelledby="storage-usage-heading">
            <Item.Heading id="storage-usage-heading">Usage</Item.Heading>

            <Item.Group>
              <Item.Root style={styles.summary}>
                <div {...stylex.props(styles.summaryHeader)}>
                  <Item.Content>
                    <Item.Label>Total</Item.Label>
                    <Item.Description>Caches excluded</Item.Description>
                  </Item.Content>

                  <Item.Value style={styles.totalValue}>
                    <Item.ValueText>{formatBytes(totalBytes)}</Item.ValueText>
                  </Item.Value>
                </div>

                <StorageUsageBar categories={categories} totalBytes={totalBytes} />
              </Item.Root>

              {categories.map((category) => (
                <Item.Root key={category.id}>
                  <div {...stylex.props(styles.category)}>
                    <span
                      aria-hidden="true"
                      {...stylex.props(styles.categoryMarker, category.color)}
                    />
                    <Item.Content>
                      <Item.Label>{category.label}</Item.Label>
                      <Item.Description>{category.description}</Item.Description>
                    </Item.Content>
                  </div>

                  <Item.Value>
                    <Item.ValueText>{formatBytes(category.bytes)}</Item.ValueText>
                  </Item.Value>
                </Item.Root>
              ))}
            </Item.Group>
          </Item.Section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  summary: {
    display: "block",
  },
  summaryHeader: {
    alignItems: "center",
    display: "flex",
    gap: "2rem",
    justifyContent: "space-between",
  },
  totalValue: {
    color: tokens.foreground,
    fontSize: tokens.fontSizeLarge,
    fontWeight: 600,
    lineHeight: tokens.lineHeightLarge,
  },
  usageBar: {
    backgroundColor: `color-mix(in oklch, ${tokens.foreground} 5%, transparent)`,
    borderRadius: "9999px",
    display: "flex",
    height: "0.5rem",
    marginTop: "1rem",
    overflow: "hidden",
    width: "100%",
  },
  usageSegment: {
    backgroundColor: "currentColor",
    display: "block",
    flexShrink: 0,
    height: "100%",
  },
  category: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    minWidth: 0,
  },
  categoryMarker: {
    backgroundColor: "currentColor",
    borderRadius: "9999px",
    flexShrink: 0,
    height: "0.5rem",
    width: "0.5rem",
  },
  userContent: {
    color: tokens.accent,
  },
  applicationData: {
    color: `color-mix(in oklch, ${tokens.muted} 60%, ${tokens.surfaceRaised})`,
  },
});
