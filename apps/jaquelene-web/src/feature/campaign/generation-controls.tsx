import type {
  AvailableModel,
  GenerationConfigurationSelection,
  ModelSelection,
  ReasoningPreset,
} from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useMemo } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { modelsForProviderQuery } from "@/feature/model/catalog-query";
import { ModelPicker } from "@/feature/model/picker";
import { ModelReasoningPicker } from "@/feature/model/reasoning-picker";
import { useSetCampaignGenerationConfigurationOverride } from "./query";

function sameModel(left: ModelSelection, right: ModelSelection) {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

function ModelReasoningControl({
  busy,
  configuration,
  disabled,
  onValueChange,
}: {
  busy: boolean;
  configuration: GenerationConfigurationSelection;
  disabled: boolean;
  onValueChange: (value: ReasoningPreset | null) => void;
}) {
  const models = useQuery(modelsForProviderQuery(configuration.model.providerId));
  const selectedModel = useMemo(
    () => models.data?.models.find(({ id }) => id === configuration.model.modelId),
    [configuration.model.modelId, models.data],
  );
  const capability = selectedModel?.reasoning;

  return (
    <ModelReasoningPicker
      capability={capability}
      busy={busy}
      disabled={disabled}
      value={configuration.reasoningPresetOverride ?? null}
      onValueChange={onValueChange}
    />
  );
}

export function CampaignGenerationControls({
  campaignId,
  configuration,
  defaultModel,
  disabled,
}: {
  campaignId: string;
  configuration: GenerationConfigurationSelection | null;
  defaultModel: ModelSelection | null;
  disabled: boolean;
}) {
  const setConfigurationOverride = useSetCampaignGenerationConfigurationOverride(campaignId);
  const errorId = useId();
  const busy = disabled || setConfigurationOverride.isPending;

  function updateConfiguration(nextConfiguration: GenerationConfigurationSelection) {
    if (disabled) {
      return;
    }

    const matchesDefault =
      nextConfiguration.reasoningPresetOverride === undefined &&
      defaultModel !== null &&
      sameModel(defaultModel, nextConfiguration.model);

    setConfigurationOverride.reset();
    setConfigurationOverride.mutate(matchesDefault ? null : nextConfiguration, {
      onError(cause) {
        reportError("campaign.generation-configuration-override.update", cause);
      },
    });
  }

  function updateModel(model: ModelSelection, availableModel: AvailableModel) {
    const reasoningPresetOverride = configuration?.reasoningPresetOverride;
    const preserveReasoningOverride =
      reasoningPresetOverride !== undefined &&
      availableModel.reasoning?.defaultPreset !== reasoningPresetOverride &&
      availableModel.reasoning?.supportedPresets.includes(reasoningPresetOverride);
    updateConfiguration({
      model,
      ...(preserveReasoningOverride ? { reasoningPresetOverride } : {}),
    });
  }

  function updateReasoning(reasoningPresetOverride: ReasoningPreset | null) {
    if (!configuration) {
      return;
    }

    updateConfiguration({
      model: { ...configuration.model },
      ...(reasoningPresetOverride === null ? {} : { reasoningPresetOverride }),
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
          aria-busy={busy || undefined}
          aria-describedby={setConfigurationOverride.isError ? errorId : undefined}
          disabled={disabled}
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
        <ModelReasoningControl
          busy={busy}
          configuration={configuration}
          disabled={disabled}
          onValueChange={updateReasoning}
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
