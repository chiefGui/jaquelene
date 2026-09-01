import type {
  GenerationConfigurationSelection,
  ModelSelection,
  ReasoningEffort,
} from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useMemo } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { modelsForProviderQuery } from "@/feature/model/catalog-query";
import { ModelEffortPicker } from "@/feature/model/effort-picker";
import { ModelPicker } from "@/feature/model/picker";
import { useSetCampaignGenerationConfigurationOverride } from "./query";

function sameModel(left: ModelSelection, right: ModelSelection) {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

function ModelEffortControl({
  configuration,
  disabled,
  onValueChange,
}: {
  configuration: GenerationConfigurationSelection;
  disabled: boolean;
  onValueChange: (value: ReasoningEffort | null) => void;
}) {
  const models = useQuery(modelsForProviderQuery(configuration.model.providerId));
  const selectedModel = useMemo(
    () => models.data?.models.find(({ id }) => id === configuration.model.modelId),
    [configuration.model.modelId, models.data],
  );
  const capability = selectedModel?.reasoning;

  if (!capability?.supportedEfforts?.length && configuration.reasoningEffort === undefined) {
    return null;
  }

  return (
    <ModelEffortPicker
      capability={capability}
      disabled={disabled}
      value={configuration.reasoningEffort ?? null}
      onValueChange={onValueChange}
    />
  );
}

export function CampaignGenerationControls({
  campaignId,
  configuration,
  defaultModel,
  pending,
}: {
  campaignId: string;
  configuration: GenerationConfigurationSelection | null;
  defaultModel: ModelSelection | null;
  pending: boolean;
}) {
  const setConfigurationOverride = useSetCampaignGenerationConfigurationOverride(campaignId);
  const errorId = useId();
  const updatePending = pending || setConfigurationOverride.isPending;

  function updateConfiguration(nextConfiguration: GenerationConfigurationSelection) {
    if (updatePending) {
      return;
    }

    const matchesDefault =
      nextConfiguration.reasoningEffort === undefined &&
      defaultModel !== null &&
      sameModel(defaultModel, nextConfiguration.model);

    setConfigurationOverride.reset();
    setConfigurationOverride.mutate(matchesDefault ? null : nextConfiguration, {
      onError(cause) {
        reportError("campaign.generation-configuration-override.update", cause);
      },
    });
  }

  function updateModel(model: ModelSelection) {
    updateConfiguration({ model });
  }

  function updateEffort(reasoningEffort: ReasoningEffort | null) {
    if (!configuration) {
      return;
    }

    updateConfiguration({
      model: { ...configuration.model },
      ...(reasoningEffort === null ? {} : { reasoningEffort }),
    });
  }

  return (
    <div {...stylex.props(styles.root)}>
      <ModelPicker.Root value={configuration?.model ?? null} onValueChange={updateModel}>
        <ModelPicker.Trigger
          type="button"
          variant="ghost"
          aria-label={
            configuration
              ? `Campaign model: ${configuration.model.name}`
              : "Choose a campaign model"
          }
          aria-busy={updatePending || undefined}
          aria-describedby={setConfigurationOverride.isError ? errorId : undefined}
          disabled={updatePending}
          style={styles.modelTrigger}
        >
          <ModelPicker.Value />
        </ModelPicker.Trigger>
        <ModelPicker.Empty>
          <Button variant="ghost" render={<Link to="/settings/providers" />}>
            Connect provider
          </Button>
        </ModelPicker.Empty>
        <ModelPicker.Content />
      </ModelPicker.Root>

      {configuration ? (
        <ModelEffortControl
          configuration={configuration}
          disabled={updatePending}
          onValueChange={updateEffort}
        />
      ) : null}

      {setConfigurationOverride.isError ? (
        <p id={errorId} role="alert" {...stylex.props(styles.error)}>
          Couldn’t save generation settings.
        </p>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    gap: "0.375rem",
    minWidth: 0,
  },
  modelTrigger: {
    flexShrink: 1,
    maxWidth: "15rem",
    width: "fit-content",
  },
  error: {
    color: tokens.danger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
});
