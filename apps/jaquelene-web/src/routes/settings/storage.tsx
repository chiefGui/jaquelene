import { diagnosticsStorageAreaId } from "@jaquelene/diagnostics";
import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { StorageCategory, type StorageAreaUsage, type StorageUsage } from "@jaquelene/ipc/renderer";
import { Button, IconButton, Item, formatBytes } from "@jaquelene/ui";
import { ConfirmDialog, type ConfirmDialogProps } from "@jaquelene/ui/confirm-dialog";
import { tokens } from "@jaquelene/ui/theme.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import {
  useIsMutating,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useId, useState } from "react";
import { storagePalette } from "../../feature/storage/palette.stylex";
import { reportError } from "@/feature/diagnostics/diagnostics";
import {
  remeasureStorageUsage,
  storageUsageQuery,
  useDeleteStorageArea,
  useDeleteStorageCategory,
} from "@/feature/storage/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/storage")({
  loader: {
    handler: ({ context }) => remeasureStorageUsage(context.queryClient),
    staleReloadMode: "blocking",
  },
  onError: (error) => reportError("storage.measure", error),
  errorComponent: StorageRouteError,
  component: StorageRoute,
});

type StorageCategoryPresentation = Readonly<{
  label: string;
  description: string;
  color: StyleXStyles;
  confirmation: Readonly<{
    heading: string;
    description: string;
    error: string;
  }>;
}>;

type StorageCategoryView = Readonly<{
  id: StorageCategory;
  bytes: number;
}> &
  StorageCategoryPresentation;

function presentStorageCategories({ areas }: StorageUsage): readonly StorageCategoryView[] {
  return ([StorageCategory.Content, StorageCategory.Cache, StorageCategory.AppData] as const).map(
    (id) => ({
      id,
      bytes: areas.reduce((total, area) => total + (area.category === id ? area.bytes : 0), 0),
      ...storageCategoryPresentations[id],
    }),
  );
}

function requireDiagnosticsArea({ areas }: StorageUsage) {
  const area = areas.find(({ id }) => id === diagnosticsStorageAreaId);

  if (!area || area.category !== StorageCategory.AppData) {
    throw new Error("Diagnostics storage is not registered as app data.");
  }

  return area;
}

async function remeasureStorage(operation: string, queryClient: QueryClient) {
  try {
    await remeasureStorageUsage(queryClient);
  } catch (cause) {
    reportError(operation, cause);
  }
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

function StorageUsageBreakdown({ categories }: { categories: readonly StorageCategoryView[] }) {
  const visibleCategories = categories.filter(({ bytes }) => bytes > 0);

  if (visibleCategories.length < 2) {
    return null;
  }

  return (
    <div aria-hidden="true" {...stylex.props(styles.usageBreakdown)}>
      {visibleCategories.map((category) => (
        <span
          key={category.id}
          {...stylex.props(styles.usageSegment, category.color)}
          style={{ flexGrow: category.bytes }}
        />
      ))}
    </div>
  );
}

function StorageAreaLabel({
  color,
  description,
  label,
}: Pick<StorageCategoryPresentation, "color" | "description" | "label">) {
  return (
    <div {...stylex.props(styles.category)}>
      <span aria-hidden="true" {...stylex.props(styles.categoryMarker, color)} />
      <Item.Content>
        <Item.Label>{label}</Item.Label>
        <Item.Description>{description}</Item.Description>
      </Item.Content>
    </div>
  );
}

type StorageClearActionProps = Omit<ConfirmDialogProps, "trigger"> & {
  accessibleLabel: string;
  disabled: boolean;
};

function StorageClearAction({
  accessibleLabel,
  disabled,
  ...confirmation
}: StorageClearActionProps) {
  return (
    <Tooltip.Root>
      <ConfirmDialog
        {...confirmation}
        trigger={
          <Tooltip.Anchor
            render={
              <IconButton aria-label={accessibleLabel} disabled={disabled}>
                <HugeiconsIcon icon={TrashIcon} size={16} strokeWidth={1.5} aria-hidden="true" />
              </IconButton>
            }
          />
        }
      />

      <Tooltip>Clear</Tooltip>
    </Tooltip.Root>
  );
}

function LogsStorage({ area }: { area: StorageAreaUsage }) {
  const queryClient = useQueryClient();
  const deleteStorageArea = useDeleteStorageArea();
  const storageMutationPending = useIsMutating({ mutationKey: ["storage"] }) > 0;
  const [confirmingClear, setConfirmingClear] = useState(false);

  function setClearConfirmationOpen(open: boolean) {
    if (open) deleteStorageArea.reset();

    if (!deleteStorageArea.isPending) {
      setConfirmingClear(open);
    }
  }

  async function clearLogs() {
    try {
      await deleteStorageArea.mutateAsync(area.id);
      setConfirmingClear(false);
    } catch (cause) {
      reportError("storage.diagnostics.delete", cause);
      await remeasureStorage("storage.diagnostics.remeasure", queryClient);
    }
  }

  return (
    <Item.Root style={styles.storageRow}>
      <StorageAreaLabel
        color={styles.logs}
        label="Logs"
        description="Diagnostic records saved while you use Jaquelene."
      />

      <div {...stylex.props(styles.trailing)}>
        <Item.Value>
          <Item.ValueText>{formatBytes(area.bytes)}</Item.ValueText>
        </Item.Value>

        <div {...stylex.props(styles.actions)}>
          <StorageClearAction
            accessibleLabel="Clear logs"
            disabled={storageMutationPending}
            open={confirmingClear}
            setOpen={setClearConfirmationOpen}
            heading="Clear logs?"
            description="Removes saved logs from this device. New logs may be created later."
            confirmLabel="Clear"
            pending={deleteStorageArea.isPending}
            error={deleteStorageArea.isError ? "Couldn’t clear logs." : undefined}
            onConfirm={() => void clearLogs()}
          />
        </div>
      </div>
    </Item.Root>
  );
}

function StorageRouteError() {
  const router = useRouter();
  const headingId = useId();

  return (
    <>
      <StorageHeader />

      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Section aria-labelledby={headingId}>
            <Item.Heading id={headingId}>Usage</Item.Heading>

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
  const queryClient = useQueryClient();
  const { data: usage } = useSuspenseQuery(storageUsageQuery);
  const usageHeadingId = useId();
  const usageDescriptionId = useId();
  const [confirmation, setConfirmation] = useState<StorageCategory | null>(null);
  const deleteStorageCategory = useDeleteStorageCategory();
  const storageMutationPending = useIsMutating({ mutationKey: ["storage"] }) > 0;
  const categories = presentStorageCategories(usage);
  const diagnosticsArea = requireDiagnosticsArea(usage);
  const totalBytes = usage.areas.reduce((total, area) => total + area.bytes, 0);

  async function clearCategory(category: StorageCategoryView) {
    try {
      await deleteStorageCategory.mutateAsync(category.id);
      setConfirmation(null);
    } catch (cause) {
      reportError("storage.category.delete", cause);
      await remeasureStorage("storage.category.remeasure", queryClient);
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
          <Item.Section aria-labelledby={usageHeadingId} aria-describedby={usageDescriptionId}>
            <div {...stylex.props(styles.sectionHeader)}>
              <Item.Heading id={usageHeadingId}>Usage</Item.Heading>
              <p id={usageDescriptionId} {...stylex.props(styles.sectionDescription)}>
                Everything listed here is stored on this device.
              </p>
            </div>

            <Item.Group>
              <Item.Root style={styles.summary}>
                <div {...stylex.props(styles.summaryHeader)}>
                  <Item.Label>Total</Item.Label>

                  <Item.Value style={styles.totalValue}>
                    <Item.ValueText>{formatBytes(totalBytes)}</Item.ValueText>
                  </Item.Value>
                </div>

                <StorageUsageBreakdown categories={categories} />
              </Item.Root>

              {categories.map((category) => {
                const open = confirmation === category.id;
                const pending = open && deleteStorageCategory.isPending;

                return (
                  <Item.Root key={category.id} style={styles.storageRow}>
                    <StorageAreaLabel
                      color={category.color}
                      description={category.description}
                      label={category.label}
                    />

                    <div {...stylex.props(styles.trailing)}>
                      <Item.Value>
                        <Item.ValueText>{formatBytes(category.bytes)}</Item.ValueText>
                      </Item.Value>

                      <div {...stylex.props(styles.actions)}>
                        <StorageClearAction
                          accessibleLabel={`Clear ${category.label.toLowerCase()}`}
                          disabled={storageMutationPending}
                          open={open}
                          setOpen={(nextOpen) => setConfirmationOpen(category, nextOpen)}
                          heading={category.confirmation.heading}
                          description={category.confirmation.description}
                          confirmLabel="Clear"
                          pending={pending}
                          error={
                            open && deleteStorageCategory.isError
                              ? category.confirmation.error
                              : undefined
                          }
                          onConfirm={() => void clearCategory(category)}
                        />
                      </div>
                    </div>
                  </Item.Root>
                );
              })}

              <LogsStorage area={diagnosticsArea} />
            </Item.Group>
          </Item.Section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  sectionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  sectionDescription: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    margin: 0,
    paddingInline: "1rem",
    textBox: "trim-both text",
  },
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
  usageBreakdown: {
    borderRadius: "9999px",
    display: "flex",
    gap: "0.125rem",
    height: "0.5rem",
    marginTop: "0.5rem",
    overflow: "hidden",
    width: "100%",
  },
  usageSegment: {
    backgroundColor: "currentColor",
    display: "block",
    flexBasis: 0,
    height: "100%",
  },
  storageRow: {
    alignItems: "flex-start",
  },
  category: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    minWidth: 0,
  },
  trailing: {
    alignItems: "center",
    alignSelf: "flex-start",
    display: "flex",
    flexShrink: 0,
    gap: "1.25rem",
    marginTop: `calc((${tokens.lineHeightSmall} - ${tokens.controlHeight}) / 2)`,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
  },
  categoryMarker: {
    backgroundColor: "currentColor",
    borderRadius: "9999px",
    flexShrink: 0,
    height: "0.5rem",
    marginTop: `calc((${tokens.lineHeightSmall} - 0.5rem) / 2)`,
    width: "0.5rem",
  },
  content: {
    color: storagePalette.content,
  },
  cache: {
    color: storagePalette.cache,
  },
  appData: {
    color: storagePalette.appData,
  },
  logs: {
    color: storagePalette.logs,
  },
});

const storageCategoryPresentations: Record<StorageCategory, StorageCategoryPresentation> = {
  [StorageCategory.Content]: {
    label: "Content",
    description: "Chats and other content you create.",
    color: styles.content,
    confirmation: {
      heading: "Clear content?",
      description:
        "This permanently deletes your chats and other content you created in Jaquelene.",
      error: "Couldn’t finish clearing content.",
    },
  },
  [StorageCategory.Cache]: {
    label: "Cache",
    description: "Remote data saved for faster access.",
    color: styles.cache,
    confirmation: {
      heading: "Delete cache?",
      description: "Remote data will be fetched again when needed.",
      error: "Couldn’t finish deleting the cache.",
    },
  },
  [StorageCategory.AppData]: {
    label: "App data",
    description: "Preferences and other data used by Jaquelene.",
    color: styles.appData,
    confirmation: {
      heading: "Clear app data?",
      description:
        "This deletes your preferences, saved connections, and other app data. Your content is kept.",
      error: "Some app data couldn’t be cleared.",
    },
  },
};
