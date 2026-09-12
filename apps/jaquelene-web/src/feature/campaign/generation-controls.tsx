import {
  setCampaignGenerationModel,
  setCampaignGenerationReasoningPreset,
} from "@jaquelene/domain";
import type {
  AvailableModel,
  CampaignGenerationPreferences,
  ModelConfigurationSelection,
  ModelSelection,
  ModelReasoningCapability,
  ReasoningPreset,
} from "@jaquelene/ipc/renderer";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { useComposer } from "@/feature/composer/composer";
import { modelsForProviderQuery } from "@/feature/model/catalog-query";
import { ModelPicker } from "@/feature/model/picker";
import { ModelReasoningPicker } from "@/feature/model/reasoning-picker";
import { useSetCampaignGenerationPreferences } from "./query";

function ModelReasoningControl({
  busy,
  configuration,
  disabled,
  onValueChange,
}: {
  busy: boolean;
  configuration: ModelConfigurationSelection;
  disabled: boolean;
  onValueChange: (
    value: ReasoningPreset | null,
    capability: ModelReasoningCapability | undefined,
  ) => void;
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
      value={configuration.reasoningPreset ?? null}
      onValueChange={(value) => onValueChange(value, capability)}
    />
  );
}

export function CampaignGenerationControls({
  campaignId,
  configuration,
  defaultModel,
  disabled: preferencesDisabled,
  preferences,
}: {
  campaignId: string;
  configuration: ModelConfigurationSelection | null;
  defaultModel: ModelSelection | null;
  disabled: boolean;
  preferences: CampaignGenerationPreferences | undefined;
}) {
  const setPreferences = useSetCampaignGenerationPreferences(campaignId);
  const composer = useComposer();
  const errorId = useId();
  const disabled = composer.disabled || preferencesDisabled;
  const busy = disabled || setPreferences.isPending;

  function updatePreferences(nextPreferences: CampaignGenerationPreferences | undefined) {
    if (disabled) {
      return;
    }

    setPreferences.reset();
    setPreferences.mutate(nextPreferences ?? null, {
      onError(cause) {
        reportError("campaign.generation-preferences.update", cause);
      },
    });
  }

  function updateModel(model: ModelSelection, availableModel: AvailableModel) {
    updatePreferences(
      setCampaignGenerationModel(preferences, model, defaultModel, availableModel.reasoning),
    );
  }

  function updateReasoning(
    reasoningPreset: ReasoningPreset | null,
    capability: ModelReasoningCapability | undefined,
  ) {
    updatePreferences(
      setCampaignGenerationReasoningPreset(preferences, reasoningPreset ?? undefined, capability),
    );
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
          aria-describedby={setPreferences.isError ? errorId : undefined}
          disabled={disabled}
          style={styles.modelTrigger}
        >
          <ModelPicker.Value />
        </ModelPicker.Trigger>
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

      {setPreferences.isError ? (
        <p id={errorId} role="alert" {...stylex.props(styles.error)}>
          Couldn't save generation settings.
        </p>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
    minWidth: 0,
  },
  modelTrigger: {
    flexShrink: 1,
    maxWidth: "15rem",
    width: "fit-content",
  },
  error: {
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
});
