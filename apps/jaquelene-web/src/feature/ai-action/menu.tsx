import { Menu, MenuButton, MenuItem, MenuProvider } from "@ariakit/react/menu";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import SparklesIcon from "@hugeicons/core-free-icons/SparklesIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, IconButton } from "@jaquelene/ui";
import { colors, radii, shadows } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { MarkdownEditor } from "@/feature/markdown/editor/markdown-editor";
import type { AiActionControl } from "./use-ai-action";

export function AiActionMenu({ control }: { control: AiActionControl }) {
  if (!control.target) {
    return null;
  }
  if (control.busy) {
    return (
      <MarkdownEditor.Action
        icon={Cancel01Icon}
        label="Cancel AI action"
        disabled={control.state.status === "cancelling"}
        onClick={() => void control.cancel()}
      />
    );
  }
  return (
    <MenuProvider placement="bottom-start">
      <MenuButton
        disabled={control.disabled}
        render={
          <IconButton.Root type="button" shape="squircle" size="small" aria-label="AI actions">
            <IconButton.Icon render={<HugeiconsIcon icon={SparklesIcon} />} />
          </IconButton.Root>
        }
      />
      <Menu gutter={6} portal {...stylex.props(styles.menu)}>
        {control.definitions.isPending && (
          <span {...stylex.props(styles.hint)}>Loading actions…</span>
        )}
        {control.definitions.isError && (
          <MenuItem
            render={<Button variant="ghost" size="small" />}
            onClick={() => void control.definitions.refetch()}
          >
            Retry loading actions
          </MenuItem>
        )}
        {control.definitions.data?.map((action) => (
          <MenuItem
            key={action.id}
            render={<Button variant="ghost" size="small" style={styles.item} />}
            disabled={!control.model.data || (action.requiresText && !control.value.trim())}
            onClick={() => void control.run(action.id)}
          >
            {action.label}
          </MenuItem>
        ))}
        {control.model.isError && (
          <MenuItem
            render={<Button variant="ghost" size="small" />}
            onClick={() => void control.model.refetch()}
          >
            Retry loading model
          </MenuItem>
        )}
        {control.model.isPending && (
          <span role="status" {...stylex.props(styles.hint)}>
            Loading model…
          </span>
        )}
        {control.model.isSuccess && !control.model.data && (
          <span {...stylex.props(styles.hint)}>Select an AI model in Settings → General.</span>
        )}
        {control.model.data && (
          <span {...stylex.props(styles.hint)}>Model: {control.model.data.name}</span>
        )}
      </Menu>
    </MenuProvider>
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
      {!control.busy && control.undoLabel && (
        <Button
          type="button"
          size="small"
          variant="ghost"
          disabled={control.disabled}
          onClick={control.undo}
        >
          {control.undoLabel}
        </Button>
      )}
    </span>
  );
}

const styles = stylex.create({
  menu: {
    backgroundColor: colors.backgroundSurfaceRaised,
    borderColor: colors.borderOverlay,
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: radii.surface,
    boxShadow: shadows.floating,
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    minWidth: "10rem",
    padding: "0.25rem",
    zIndex: 50,
  },
  item: {
    justifyContent: "flex-start",
    backgroundColor: { default: null, ":is([data-active-item])": colors.backgroundInteractive },
  },
  hint: {
    color: colors.foregroundSecondary,
    fontSize: "0.75rem",
    padding: "0.5rem",
    maxWidth: "18rem",
    overflowWrap: "anywhere",
  },
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
