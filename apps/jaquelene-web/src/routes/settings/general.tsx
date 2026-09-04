import { Button, Item } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
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
import { SettingsLandingHeader } from "@/feature/settings/header";
import { ContentPane } from "@/layout/content-pane";

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
  const descriptionId = useId();
  const errorId = useId();
  const labelId = useId();
  const { data: defaultCampaignModel } = useSuspenseQuery(defaultCampaignModelQuery);
  const setDefaultCampaignModel = useSetDefaultCampaignModel();

  return (
    <>
      <SettingsLandingHeader />

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
                  <Item.Description id={descriptionId}>
                    Used when starting a new campaign.
                  </Item.Description>
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
                      aria-describedby={
                        setDefaultCampaignModel.error
                          ? `${descriptionId} ${errorId}`
                          : descriptionId
                      }
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
    color: colors.foregroundDanger,
  },
});
