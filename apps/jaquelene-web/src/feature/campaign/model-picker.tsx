import type { ModelSelection } from "@jaquelene/ipc/renderer";
import { Button } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ModelPicker } from "@/feature/model/picker";
import { useSetCampaignModelOverride } from "./query";

export function CampaignModelPicker({
  campaignId,
  inherited,
  model,
}: {
  campaignId: string;
  inherited: boolean;
  model: ModelSelection | null;
}) {
  const setModelOverride = useSetCampaignModelOverride(campaignId);

  function updateModel(nextModel: ModelSelection | null) {
    setModelOverride.reset();
    setModelOverride.mutate(nextModel, {
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
          aria-label={
            model
              ? `Campaign model: ${model.name}${inherited ? ", default" : ""}`
              : "Choose a campaign model"
          }
          aria-busy={setModelOverride.isPending}
          disabled={setModelOverride.isPending}
          style={styles.trigger}
        >
          <ModelPicker.Value />
          {inherited && model ? <span {...stylex.props(styles.defaultLabel)}>Default</span> : null}
        </ModelPicker.Trigger>
        <ModelPicker.Empty>
          <Button variant="ghost" render={<Link to="/settings/providers" />}>
            Connect provider
          </Button>
        </ModelPicker.Empty>
        <ModelPicker.Content />
      </ModelPicker.Root>

      {!inherited ? (
        <Button
          type="button"
          variant="ghost"
          disabled={setModelOverride.isPending}
          onClick={() => updateModel(null)}
          style={styles.defaultButton}
        >
          Use default
        </Button>
      ) : null}

      {setModelOverride.isError ? (
        <p role="alert" {...stylex.props(styles.error)}>
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
    maxWidth: "calc(100vw - 10rem)",
    width: "15rem",
  },
  defaultLabel: {
    color: tokens.muted,
    flexShrink: 0,
    fontSize: tokens.fontSizeXSmall,
    fontWeight: 400,
    lineHeight: tokens.lineHeightXSmall,
  },
  defaultButton: {
    height: tokens.controlHeight,
    paddingInline: "0.5rem",
  },
  error: {
    color: tokens.danger,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
});
