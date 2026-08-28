import { Button, Item } from "@jaquelene/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useId } from "react";
import { ModelPicker } from "@/feature/model/picker";
import { defaultModelQuery, useSetDefaultModel } from "@/feature/preferences/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/general")({
  loader: ({ context }) => context.queryClient.query(defaultModelQuery),
  component: GeneralRoute,
});

function GeneralRoute() {
  const { data: defaultModel } = useSuspenseQuery(defaultModelQuery);
  const setDefaultModel = useSetDefaultModel();
  const labelId = useId();
  const valueId = useId();

  return (
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

      <ContentPane.Viewport>
        <div className="mx-auto w-full max-w-2xl p-6">
          <Item.Group>
            <Item.Root>
              <Item.Content>
                <Item.Label id={labelId}>Default model</Item.Label>
              </Item.Content>

              <Item.Value>
                <ModelPicker.Root
                  value={defaultModel}
                  onValueChange={async (model) => {
                    await setDefaultModel.mutateAsync(model);
                  }}
                >
                  <ModelPicker.Trigger aria-labelledby={`${labelId} ${valueId}`}>
                    <ModelPicker.Value id={valueId} />
                  </ModelPicker.Trigger>
                  <ModelPicker.Empty>
                    <Button render={<Link to="/settings/providers" />}>Connect a provider</Button>
                  </ModelPicker.Empty>
                  <ModelPicker.Content />
                </ModelPicker.Root>
              </Item.Value>
            </Item.Root>
          </Item.Group>
        </div>
      </ContentPane.Viewport>
    </>
  );
}
