import FolderOpenIcon from "@hugeicons/core-free-icons/FolderOpenIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Item, Switch } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId } from "react";
import { openDiagnosticsDirectory, reportError } from "@/feature/diagnostics/diagnostics";
import {
  diagnosticsPreferencesQuery,
  useSetDiagnosticsWriteToDisk,
} from "@/feature/diagnostics/preferences";
import { ipcMutationOptions } from "@/ipc";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/advanced")({
  loader: ({ context }) => context.queryClient.query(diagnosticsPreferencesQuery),
  component: AdvancedRoute,
});

function AdvancedRoute() {
  const { data: preferences } = useSuspenseQuery(diagnosticsPreferencesQuery);
  const setWriteToDisk = useSetDiagnosticsWriteToDisk();
  const openLogsFolder = useMutation({
    ...ipcMutationOptions,
    mutationKey: ["diagnostics", "open-directory"],
    mutationFn: openDiagnosticsDirectory,
    onError: (error) => reportError("diagnostics.open", error),
  });
  const writeToDiskId = useId();
  const writeToDiskLabelId = useId();
  const writeToDiskDescriptionId = useId();
  const openLogsFolderErrorId = useId();
  const preferenceError = setWriteToDisk.isError ? "Couldn’t save the preference." : null;

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Settings</Breadcrumb.Item>
            <Breadcrumb.Separator />
            <Breadcrumb.Item>
              <Breadcrumb.Page>Advanced</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Group>
            <Item.Root style={styles.preferenceItem}>
              <div {...stylex.props(styles.preferenceHeader)}>
                <Item.Content>
                  <Item.Label id={writeToDiskLabelId} render={<label htmlFor={writeToDiskId} />}>
                    Save logs
                  </Item.Label>
                  <Item.Description
                    id={writeToDiskDescriptionId}
                    role={preferenceError ? "alert" : undefined}
                    style={preferenceError ? styles.error : undefined}
                  >
                    {preferenceError ??
                      "Keep app logs on this device to help troubleshoot problems."}
                  </Item.Description>
                </Item.Content>

                <Switch
                  id={writeToDiskId}
                  aria-labelledby={writeToDiskLabelId}
                  aria-describedby={writeToDiskDescriptionId}
                  aria-busy={setWriteToDisk.isPending || undefined}
                  checked={preferences.writeToDisk}
                  disabled={setWriteToDisk.isPending}
                  onCheckedChange={setWriteToDisk.mutate}
                />
              </div>

              <Button
                variant="ghost"
                style={styles.openFolder}
                aria-describedby={openLogsFolder.isError ? openLogsFolderErrorId : undefined}
                aria-busy={openLogsFolder.isPending || undefined}
                disabled={openLogsFolder.isPending}
                onClick={() => openLogsFolder.mutate()}
              >
                <HugeiconsIcon
                  icon={FolderOpenIcon}
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <Button.Label>Open folder</Button.Label>
              </Button>

              {openLogsFolder.isError ? (
                <Item.Description id={openLogsFolderErrorId} role="alert" style={styles.error}>
                  Couldn’t open the folder.
                </Item.Description>
              ) : null}
            </Item.Root>
          </Item.Group>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  preferenceItem: {
    display: "block",
  },
  preferenceHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: "2rem",
    justifyContent: "space-between",
  },
  error: {
    color: tokens.danger,
  },
  openFolder: {
    gap: "0.5rem",
    marginTop: "0.75rem",
  },
});
