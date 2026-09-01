import { Button, Item } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useId } from "react";
import {
  defaultCampaignModelQuery,
  useSetDefaultCampaignModel,
} from "@/feature/campaign/preferences";
import { modelProvidersQuery } from "@/feature/model/catalog-query";
import { ModelPicker } from "@/feature/model/picker";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/general")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query(defaultCampaignModelQuery),
      context.queryClient.query(modelProvidersQuery),
    ]);
  },
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
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Settings</Breadcrumb.Item>
            <Breadcrumb.Separator />
            <Breadcrumb.Item>
              <Breadcrumb.Page>General</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Section aria-labelledby="campaign-heading">
            <Item.Heading id="campaign-heading">Campaign</Item.Heading>

            <Item.Group>
              <Item.Root>
                <Item.Content>
                  <Item.Label id={labelId} render={<label htmlFor={controlId} />}>
                    Default model
                  </Item.Label>
                  {setDefaultCampaignModel.error ? (
                    <Item.Description id={errorId} role="alert" style={styles.error}>
                      Couldn't save the default campaign model
                    </Item.Description>
                  ) : null}
                </Item.Content>

                <Item.Value>
                  <ModelPicker.Root
                    value={defaultCampaignModel}
                    onValueChange={(model) => setDefaultCampaignModel.mutate(model)}
                  >
                    <ModelPicker.Trigger
                      id={controlId}
                      aria-labelledby={labelId}
                      aria-describedby={setDefaultCampaignModel.error ? errorId : undefined}
                      disabled={setDefaultCampaignModel.isPending}
                    />
                    <ModelPicker.Empty>
                      <Button render={<Link to="/settings/providers" replace />}>
                        Connect a provider
                      </Button>
                    </ModelPicker.Empty>
                    <ModelPicker.Content />
                  </ModelPicker.Root>
                </Item.Value>
              </Item.Root>
            </Item.Group>
          </Item.Section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  error: {
    color: tokens.danger,
  },
});
