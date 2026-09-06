import { Item } from "@jaquelene/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  defaultCampaignModelQuery,
  useSetDefaultCampaignModel,
} from "@/feature/campaign/preferences";
import { modelProvidersQuery } from "@/feature/model/catalog-query";
import { DefaultModelSetting } from "@/feature/model/default-model-setting";
import {
  defaultRegenerationModelQuery,
  useSetDefaultRegenerationModel,
} from "@/feature/thread/regeneration-preferences";
import { SettingsLandingHeader } from "@/feature/settings/header";
import { ContentPane } from "@/layout/content-pane";

export const Route = createFileRoute("/settings/general")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query(defaultCampaignModelQuery),
      context.queryClient.query(defaultRegenerationModelQuery),
      context.queryClient.query(modelProvidersQuery),
    ]);
  },
  component: GeneralRoute,
});

function GeneralRoute() {
  const { data: defaultCampaignModel } = useSuspenseQuery(defaultCampaignModelQuery);
  const setDefaultCampaignModel = useSetDefaultCampaignModel();
  const { data: defaultRegenerationModel } = useSuspenseQuery(defaultRegenerationModelQuery);
  const setDefaultRegenerationModel = useSetDefaultRegenerationModel();

  return (
    <>
      <SettingsLandingHeader />
      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Section aria-labelledby="campaign-heading">
            <Item.SectionHeader>
              <Item.Heading id="campaign-heading">Campaign</Item.Heading>
            </Item.SectionHeader>
            <Item.Group>
              <DefaultModelSetting
                description="Used when starting a new campaign."
                model={defaultCampaignModel}
                pending={setDefaultCampaignModel.isPending}
                error={setDefaultCampaignModel.isError}
                onSelect={(model) => setDefaultCampaignModel.mutate(model)}
              />
            </Item.Group>
          </Item.Section>
          <Item.Section aria-labelledby="regeneration-heading">
            <Item.SectionHeader>
              <Item.Heading id="regeneration-heading">Regeneration</Item.Heading>
            </Item.SectionHeader>
            <Item.Group>
              <DefaultModelSetting
                description="Preselected for regeneration. If unset, uses the campaign model."
                model={defaultRegenerationModel}
                pending={setDefaultRegenerationModel.isPending}
                error={setDefaultRegenerationModel.isError}
                onSelect={(model) => setDefaultRegenerationModel.mutate(model)}
                onClear={() => setDefaultRegenerationModel.mutate(null)}
              />
            </Item.Group>
          </Item.Section>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}
