import type { ModelSelection } from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ModelPicker } from "@/feature/model/picker";
import { useSetCampaignModelOverride } from "./query";

export function CampaignModelPicker({
  campaignId,
  defaultModel,
  model,
}: {
  campaignId: string;
  defaultModel: ModelSelection | null;
  model: ModelSelection | null;
}) {
  const setModelOverride = useSetCampaignModelOverride(campaignId);
  const errorId = useId();

  function updateModel(nextModel: ModelSelection) {
    const matchesDefault =
      defaultModel?.providerId === nextModel.providerId &&
      defaultModel.modelId === nextModel.modelId;

    setModelOverride.reset();
    setModelOverride.mutate(matchesDefault ? null : nextModel, {
      onError(cause) {
        reportError("campaign.model-override.update", cause);
      },
    });
  }

  return (
    <div {...stylex.props(styles.root)}>
      <ModelPicker.Root value={model} onValueChange={updateModel}>
        <ModelPicker.Trigger
          type="button"
          variant="ghost"
          aria-label={model ? `Campaign model: ${model.name}` : "Choose a campaign model"}
          aria-busy={setModelOverride.isPending}
          aria-describedby={setModelOverride.isError ? errorId : undefined}
          disabled={setModelOverride.isPending}
          style={styles.trigger}
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

      {setModelOverride.isError ? (
        <p id={errorId} role="alert" {...stylex.props(styles.error)}>
          Couldn’t save model.
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
  trigger: {
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
