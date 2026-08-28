import { Storage } from "@jaquelene/ipc/renderer";
import { Item, formatBytes } from "@jaquelene/ui";
import { createFileRoute } from "@tanstack/react-router";
import { requireIpcMethod } from "@/ipc";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

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

      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Group>
            <Item.Root>
              <Item.Content>
                <Item.Label>Local data</Item.Label>
                <Item.Description>
                  Scenarios, preferences, and supporting app data.
                </Item.Description>
              </Item.Content>
              <Item.Value>
                <Item.ValueText>{formatBytes(totalBytes)}</Item.ValueText>
              </Item.Value>
            </Item.Root>
          </Item.Group>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}
