import {
  StorageCategory,
  type StorageCategoryUsage,
  type StorageUsage,
} from "@jaquelene/ipc/renderer";
import { Button, Item, formatBytes } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { measureStorageUsage, useDeleteStorageCategory } from "@/feature/storage/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

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

type StorageCategoryPresentation = Readonly<{
  label: string;
  color: StyleXStyles;
  confirmation: Readonly<{
    heading: string;
    description: string;
    error: string;
  }>;
}>;

type StorageCategoryView = StorageCategoryUsage & StorageCategoryPresentation;

function presentStorageCategories({ categories }: StorageUsage): readonly StorageCategoryView[] {
  return categories.map((category) => ({
    ...category,
    ...storageCategoryPresentations[category.id],
  }));
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
  categories: readonly StorageCategoryView[];
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
  const loadedUsage = Route.useLoaderData();
  const [latestUsage, setLatestUsage] = useState<StorageUsage | null>(null);
  const [confirmation, setConfirmation] = useState<StorageCategory | null>(null);
  const deleteStorageCategory = useDeleteStorageCategory();
  const usage = latestUsage ?? loadedUsage;
  const categories = presentStorageCategories(usage);
  const totalBytes = categories.reduce((total, category) => total + category.bytes, 0);

  async function deleteCategory(category: StorageCategoryView) {
    try {
      const nextUsage = await deleteStorageCategory.mutateAsync(category.id);
      setLatestUsage(nextUsage);
      setConfirmation(null);
    } catch (cause) {
      console.error(`Could not delete storage category "${category.id}".`, cause);
    }
  }

  function setConfirmationOpen(category: StorageCategoryView, open: boolean) {
    if (open) {
      deleteStorageCategory.reset();
      setConfirmation(category.id);
      return;
    }

    if (!deleteStorageCategory.isPending && confirmation === category.id) {
      setConfirmation(null);
    }
  }

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
                  <Item.Label>Total</Item.Label>

                  <Item.Value style={styles.totalValue}>
                    <Item.ValueText>{formatBytes(totalBytes)}</Item.ValueText>
                  </Item.Value>
                </div>

                <StorageUsageBar categories={categories} totalBytes={totalBytes} />
              </Item.Root>

              {categories.map((category) => {
                const open = confirmation === category.id;
                const pending = open && deleteStorageCategory.isPending;

                return (
                  <Item.Root key={category.id}>
                    <div {...stylex.props(styles.category)}>
                      <span
                        aria-hidden="true"
                        {...stylex.props(styles.categoryMarker, category.color)}
                      />
                      <Item.Label>{category.label}</Item.Label>
                    </div>

                    <div {...stylex.props(styles.categoryEnd)}>
                      <Item.Value>
                        <Item.ValueText>{formatBytes(category.bytes)}</Item.ValueText>
                      </Item.Value>

                      <ConfirmDialog
                        open={open}
                        setOpen={(nextOpen) => setConfirmationOpen(category, nextOpen)}
                        trigger={
                          <Button
                            variant="ghost"
                            tone="danger"
                            disabled={deleteStorageCategory.isPending}
                          >
                            Delete
                          </Button>
                        }
                        heading={category.confirmation.heading}
                        description={category.confirmation.description}
                        confirmLabel="Delete"
                        pending={pending}
                        error={
                          open && deleteStorageCategory.isError
                            ? category.confirmation.error
                            : undefined
                        }
                        onConfirm={() => void deleteCategory(category)}
                      />
                    </div>
                  </Item.Root>
                );
              })}
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
  categoryEnd: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.75rem",
  },
  categoryMarker: {
    backgroundColor: "currentColor",
    borderRadius: "9999px",
    flexShrink: 0,
    height: "0.5rem",
    width: "0.5rem",
  },
  content: {
    color: tokens.accent,
  },
  appData: {
    color: `color-mix(in oklch, ${tokens.muted} 60%, ${tokens.surfaceRaised})`,
  },
});

const storageCategoryPresentations: Record<StorageCategory, StorageCategoryPresentation> = {
  [StorageCategory.Content]: {
    label: "Content",
    color: styles.content,
    confirmation: {
      heading: "Delete content?",
      description: "This can’t be undone.",
      error: "Couldn’t delete content.",
    },
  },
  [StorageCategory.AppData]: {
    label: "App data",
    color: styles.appData,
    confirmation: {
      heading: "Delete app data?",
      description: "This resets the app without deleting your content.",
      error: "Couldn’t delete app data.",
    },
  },
};
