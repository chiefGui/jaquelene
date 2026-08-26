import { Storage } from "@jaquelene/ipc/renderer";
import { formatBytes } from "@jaquelene/ui";
import { createFileRoute } from "@tanstack/react-router";
import { requireIpcMethod } from "../../ipc";
import { ContentPane } from "../../layout/content-pane";
import { Breadcrumb } from "../../primitive/breadcrumb";
import { Item } from "../../primitive/item";

const measureStorageUsage = requireIpcMethod(Storage?.measureUsage);

export const Route = createFileRoute("/settings/storage")({
  loader: measureStorageUsage,
  component: StorageRoute,
});

function StorageRoute() {
  const { totalBytes } = Route.useLoaderData();

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root className="min-w-0 text-sm">
          <Breadcrumb.List className="flex min-w-0 items-center gap-2">
            <Breadcrumb.Item className="text-muted">Settings</Breadcrumb.Item>
            <Breadcrumb.Separator className="text-muted" />
            <Breadcrumb.Item>
              <Breadcrumb.Page className="font-medium text-foreground">Storage</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <div className="mx-auto w-full max-w-2xl p-6">
          <Item.Group>
            <Item.Root>
              <Item.Content>
                <Item.Title>Local data</Item.Title>
                <Item.Description>
                  Scenarios, preferences, and supporting app data.
                </Item.Description>
              </Item.Content>
              <Item.Meta>{formatBytes(totalBytes)}</Item.Meta>
            </Item.Root>
          </Item.Group>
        </div>
      </ContentPane.Viewport>
    </>
  );
}
