import { createFileRoute } from "@tanstack/react-router";
import { ContentPane } from "../../layout/content-pane";
import { Breadcrumb } from "../../primitive/breadcrumb";

export const Route = createFileRoute("/settings/general")({
  component: () => (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root className="min-w-0 text-sm">
          <Breadcrumb.List className="flex min-w-0 items-center gap-2">
            <Breadcrumb.Item className="text-muted">Settings</Breadcrumb.Item>
            <Breadcrumb.Separator className="text-muted" />
            <Breadcrumb.Item>
              <Breadcrumb.Page className="font-medium text-foreground">General</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport className="grid place-items-center">
        <h1 className="text-sm font-medium">General settings</h1>
      </ContentPane.Viewport>
    </>
  ),
});
