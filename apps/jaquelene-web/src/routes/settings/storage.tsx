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
import { useState } from "react";
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
  return ([StorageCategory.Content, StorageCategory.AppData] as const).map((id) => ({
    id,
    bytes: areas.reduce((total, area) => total + (area.category === id ? area.bytes : 0), 0),
    ...storageCategoryPresentations[id],
  }));
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
    <Item.Root>
      <div {...stylex.props(styles.category)}>
        <span aria-hidden="true" {...stylex.props(styles.categoryMarker, styles.logs)} />
        <Item.Label>Logs</Item.Label>
      </div>

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
  const queryClient = useQueryClient();
  const { data: usage } = useSuspenseQuery(storageUsageQuery);
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
  trailing: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "1.25rem",
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
    width: "0.5rem",
  },
  error: {
    color: tokens.danger,
  },
  content: {
    color: storagePalette.content,
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
    color: styles.content,
    confirmation: {
      heading: "Clear content?",
      description: "This can’t be undone.",
      error: "Couldn’t finish clearing content.",
    },
  },
  [StorageCategory.AppData]: {
    label: "App data",
    color: styles.appData,
    confirmation: {
      heading: "Clear app data?",
      description: "This resets the app without deleting your content.",
      error: "Some app data couldn’t be cleared.",
    },
  },
};
