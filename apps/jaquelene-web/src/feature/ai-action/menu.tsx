import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import SparklesIcon from "@hugeicons/core-free-icons/SparklesIcon";
import { Menu } from "@jaquelene/ui/menu";
import { colors } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { IconAction } from "@/primitive/icon-action";
import type { AiActionControl } from "./use-ai-action";

export function AiActionMenu({ control }: { control: AiActionControl }) {
  if (!control.target) {
    return null;
  }
  if (control.busy) {
    return (
      <IconAction
        icon={Cancel01Icon}
        label="Cancel AI action"
        disabled={control.state.status === "cancelling"}
        onClick={() => void control.cancel()}
      />
    );
  }
  return (
    <Menu.Root>
      <Menu.Trigger
        disabled={control.disabled}
        render={<IconAction icon={SparklesIcon} label="AI actions" />}
      />
      <Menu>
        {control.definitions.isPending && (
          <Menu.Description role="status">Loading actions…</Menu.Description>
        )}
        {control.definitions.isError && (
          <Menu.Item onClick={() => void control.definitions.refetch()}>
            Retry loading actions
          </Menu.Item>
        )}
        {control.definitions.data?.map((action) => (
          <Menu.Item
            key={action.id}
            disabled={
              control.disabled ||
              !control.model.data ||
              (action.requiresText && !control.value.trim())
            }
            onClick={() => void control.run(action.id)}
          >
            {action.label}
          </Menu.Item>
        ))}
        {control.model.isError && (
          <Menu.Item onClick={() => void control.model.refetch()}>Retry loading model</Menu.Item>
        )}
        {control.model.isPending && (
          <Menu.Description role="status">Loading model…</Menu.Description>
        )}
        {control.model.isSuccess && !control.model.data && (
          <Menu.Description>Select an AI model in Settings → General.</Menu.Description>
        )}
      </Menu>
    </Menu.Root>
  );
}

export function AiActionStatus({ control }: { control: AiActionControl }) {
  if (!control.target) {
    return null;
  }
  let message = "";
  let role: "alert" | "status" = "status";
  if (control.state.status === "running") {
    message = control.state.cancellationError ?? "Working…";
    if (control.state.cancellationError) {
      role = "alert";
    }
  } else if (control.state.status === "cancelling") {
    message = "Cancelling…";
  } else if (control.state.status === "failed") {
    message = control.state.message;
    role = "alert";
  }
  return (
    <span {...stylex.props(styles.status)}>
      <span role={role} {...stylex.props(control.state.status === "failed" && styles.error)}>
        {message}
      </span>
    </span>
  );
}

const styles = stylex.create({
  status: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    minHeight: "1.75rem",
    minWidth: 0,
    marginInlineEnd: "auto",
    paddingInlineEnd: "0.75rem",
  },
  error: { color: colors.foregroundDanger },
});
