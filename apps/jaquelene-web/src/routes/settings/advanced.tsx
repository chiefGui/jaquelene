import { Button, Item } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { openDiagnosticsDirectory, reportError } from "@/feature/diagnostics/diagnostics";
import { ipcMutationOptions } from "@/ipc";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/advanced")({
  component: AdvancedRoute,
});

function AdvancedRoute() {
  const openDiagnostics = useMutation({
    ...ipcMutationOptions,
    mutationKey: ["diagnostics", "open-directory"],
    mutationFn: openDiagnosticsDirectory,
    onError: (error) => reportError("diagnostics.open", error),
  });

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
            <Item.Root style={styles.item}>
              <Item.Content>
                <Item.Label>Diagnostics</Item.Label>
                <Item.Description>App logs for troubleshooting.</Item.Description>
                {openDiagnostics.isError ? (
                  <Item.Description role="alert" style={styles.error}>
                    Couldn't open the folder
                  </Item.Description>
                ) : null}
              </Item.Content>

              <Button
                variant="ghost"
                disabled={openDiagnostics.isPending}
                onClick={() => openDiagnostics.mutate()}
              >
                Open folder
              </Button>
            </Item.Root>
          </Item.Group>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  item: {
    alignItems: "flex-start",
  },
  error: {
    color: tokens.danger,
  },
});
