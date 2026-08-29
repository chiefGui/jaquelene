import { diagnosticsStorageAreaId } from "@jaquelene/diagnostics";
import TrashIcon from "@hugeicons/core-free-icons/TrashIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { StorageCategory, type StorageAreaUsage, type StorageUsage } from "@jaquelene/ipc/renderer";
import { Button, Item, formatBytes } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { openDiagnosticsDirectory, reportError } from "@/feature/diagnostics/diagnostics";
import {
  remeasureStorageUsage,
  storageUsageQuery,
  useDeleteStorageArea,
  useDeleteStorageCategory,
} from "@/feature/storage/query";
import { ipcMutationOptions } from "@/ipc";
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

function StorageDeleteButton({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <Button
      aria-label={label}
      variant="ghost"
      tone="danger"
      style={styles.deleteButton}
      disabled={disabled}
    >
      <HugeiconsIcon icon={TrashIcon} size={16} strokeWidth={1.5} aria-hidden="true" />
    </Button>
  );
}

function LogsStorage({ area }: { area: StorageAreaUsage }) {
  const queryClient = useQueryClient();
  const deleteStorageArea = useDeleteStorageArea();
  const storageMutationPending = useIsMutating({ mutationKey: ["storage"] }) > 0;
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  const openDiagnostics = useMutation({
    ...ipcMutationOptions,
    mutationKey: ["diagnostics", "open-directory"],
    mutationFn: openDiagnosticsDirectory,
    onError: (error) => reportError("diagnostics.open", error),
  });
  const pending = storageMutationPending || openDiagnostics.isPending;

  function setDeletionConfirmationOpen(open: boolean) {
    if (open) deleteStorageArea.reset();

    if (!deleteStorageArea.isPending) {
      setConfirmingDeletion(open);
    }
  }

  async function deleteDiagnostics() {
    try {
      await deleteStorageArea.mutateAsync(area.id);
      setConfirmingDeletion(false);
    } catch (cause) {
      reportError("storage.diagnostics.delete", cause);
      await remeasureStorage("storage.diagnostics.remeasure", queryClient);
    }
  }

  return (
    <Item.Root>
      <div {...stylex.props(styles.category)}>
        <span aria-hidden="true" {...stylex.props(styles.categoryMarker, styles.appData)} />

        <Item.Content>
          <Item.Label>Logs</Item.Label>
          {openDiagnostics.isError ? (
            <Item.Description role="alert" style={styles.error}>
              Couldn’t open the folder
            </Item.Description>
          ) : null}
        </Item.Content>
      </div>

      <div {...stylex.props(styles.itemEnd)}>
        <Item.Value>
          <Item.ValueText>{formatBytes(area.bytes)}</Item.ValueText>
        </Item.Value>

        <Button variant="ghost" disabled={pending} onClick={() => openDiagnostics.mutate()}>
          Open folder
        </Button>

        <ConfirmDialog
          open={confirmingDeletion}
          setOpen={setDeletionConfirmationOpen}
          trigger={<StorageDeleteButton label="Delete logs" disabled={pending} />}
          heading="Delete logs?"
          description="Removes saved logs from this device. New logs may be created later."
          confirmLabel="Delete"
          pending={deleteStorageArea.isPending}
          error={deleteStorageArea.isError ? "Couldn’t delete logs." : undefined}
          onConfirm={() => void deleteDiagnostics()}
        />
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

  async function deleteCategory(category: StorageCategoryView) {
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

                    <div {...stylex.props(styles.itemEnd)}>
                      <Item.Value>
                        <Item.ValueText>{formatBytes(category.bytes)}</Item.ValueText>
                      </Item.Value>

                      <ConfirmDialog
                        open={open}
                        setOpen={(nextOpen) => setConfirmationOpen(category, nextOpen)}
                        trigger={
                          <StorageDeleteButton
                            label={`Delete ${category.label.toLowerCase()}`}
                            disabled={storageMutationPending}
                          />
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
  itemEnd: {
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
  deleteButton: {
    paddingInline: 0,
    width: tokens.controlHeight,
  },
  error: {
    color: tokens.danger,
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
      error: "Couldn’t finish deleting content.",
    },
  },
  [StorageCategory.AppData]: {
    label: "App data",
    color: styles.appData,
    confirmation: {
      heading: "Delete app data?",
      description: "This resets the app without deleting your content.",
      error: "Some app data couldn’t be deleted.",
    },
  },
};
