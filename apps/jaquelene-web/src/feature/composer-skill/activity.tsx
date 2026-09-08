import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import ArrowReloadHorizontalIcon from "@hugeicons/core-free-icons/ArrowReloadHorizontalIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton } from "@jaquelene/ui";
import { Tooltip } from "@jaquelene/ui/tooltip";
import type { ComponentProps } from "react";
import { Composer, useComposer } from "@/feature/composer/composer";
import { Backlight } from "@/primitive/backlight/backlight";
import type { ComposerSkillExecution } from "./use-composer-skill";

function ActivityAction({
  label,
  icon,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Anchor
        showOnHover={!disabled}
        render={
          <IconButton.Root
            type="button"
            aria-label={label}
            size="small"
            disabled={disabled}
            onClick={onClick}
          >
            <IconButton.Icon render={<HugeiconsIcon icon={icon} />} />
          </IconButton.Root>
        }
      />
      <Tooltip>{label}</Tooltip>
    </Tooltip.Root>
  );
}

export function ComposerSkillActivity({ execution }: { execution: ComposerSkillExecution }) {
  const { input } = useComposer();
  const { generation, cancellation, unavailable } = execution;
  let feedback;
  let actions;

  if (generation.isPending) {
    const cancelling = cancellation.isPending || cancellation.isSuccess;
    let progress = generation.variables.skill.pendingLabel;
    let statusRole: "status" | "alert" = "status";
    if (cancelling) progress = "Cancelling…";
    if (cancellation.isError) {
      progress = "Could not cancel. Try again.";
      statusRole = "alert";
    }
    feedback = (
      <>
        <Backlight active />
        <Composer.Status role={statusRole} pending={!cancellation.isError}>
          {progress}
        </Composer.Status>
      </>
    );
    actions = (
      <ActivityAction
        label="Cancel generation"
        icon={Cancel01Icon}
        disabled={cancelling}
        onClick={() => {
          cancellation.mutate();
          input.current?.focus();
        }}
      />
    );
  } else if (
    generation.isError ||
    generation.data?.status === "failed" ||
    generation.data?.status === "draft-changed"
  ) {
    let message = "Could not generate a response.";
    if (generation.data?.status === "failed") message = generation.data.message;
    if (generation.data?.status === "draft-changed") message = "Draft changed. Your text was kept.";
    feedback = <Composer.Status role="alert">{message}</Composer.Status>;
    actions = (
      <>
        <ActivityAction
          label="Retry"
          icon={ArrowReloadHorizontalIcon}
          disabled={unavailable}
          onClick={execution.retry}
        />
        <ActivityAction
          label="Dismiss"
          icon={Cancel01Icon}
          onClick={() => {
            generation.reset();
            input.current?.focus();
          }}
        />
      </>
    );
  }

  return (
    <Composer.Activity open={feedback !== undefined} actions={actions}>
      {feedback}
    </Composer.Activity>
  );
}
