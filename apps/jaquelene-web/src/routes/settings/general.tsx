import { Button, Item } from "@jaquelene/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useId } from "react";
import {
  defaultCampaignModelQuery,
  useSetDefaultCampaignModel,
} from "@/feature/campaign/preferences";
import { ModelPicker } from "@/feature/model/picker";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/general")({
  loader: ({ context }) => context.queryClient.query(defaultCampaignModelQuery),
  component: GeneralRoute,
});

function GeneralRoute() {
  const controlId = useId();
  const errorId = useId();
  const labelId = useId();
  const { data: defaultCampaignModel } = useSuspenseQuery(defaultCampaignModelQuery);
  const setDefaultCampaignModel = useSetDefaultCampaignModel();

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
                <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
                  Default campaign model
                </Item.Label>
                {setDefaultCampaignModel.error ? (
                  <Item.Description id={errorId} role="alert" className="text-danger">
                    Couldn't save the default campaign model
                  </Item.Description>
                ) : null}
              </Item.Content>

              <Item.Value>
                <ModelPicker.Root
                  value={defaultCampaignModel}
                  onValueChange={setDefaultCampaignModel.mutate}
                >
                  <ModelPicker.Trigger
                    id={controlId}
                    aria-labelledby={labelId}
                    aria-describedby={setDefaultCampaignModel.error ? errorId : undefined}
                  />
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
