import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import Bookmark02Icon from "@hugeicons/core-free-icons/Bookmark02Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Prompt } from "@jaquelene/ipc/renderer";
import { IconButton } from "@jaquelene/ui";
import { colors } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { promptLibraryItemStyles } from "./library-item";
import type { useSetPromptDefault } from "./query";

export type SetPromptDefaultMutation = ReturnType<typeof useSetPromptDefault>;

export function PromptDefaultAction({
  defaultPromptKey,
  prompt,
  kindLabel,
  setDefault,
  allowClear = false,
}: {
  defaultPromptKey: string | undefined;
  prompt: Prompt;
  kindLabel: string;
  setDefault: SetPromptDefaultMutation;
  allowClear?: boolean;
}) {
  let displayedDefaultPromptKey = defaultPromptKey;
  if (setDefault.isPending) displayedDefaultPromptKey = setDefault.variables;
  const isDefault = prompt.key === displayedDefaultPromptKey;
  const affectedPromptKey = setDefault.variables ?? defaultPromptKey;
  const pending = setDefault.isPending && affectedPromptKey === prompt.key;
  const failed = setDefault.isError && affectedPromptKey === prompt.key;
  let tooltip = "Set as default";
  let label = `Set ${prompt.title} as the default ${kindLabel}`;
  let fill = "none";
  if (isDefault) {
    tooltip = "Default";
    label = `${prompt.title} is the default ${kindLabel}`;
    fill = "currentColor";
    if (allowClear) {
      tooltip = "Clear default";
      label = `Clear ${prompt.title} as the default ${kindLabel}`;
    }
  }
  if (failed) tooltip = "Couldn't update default";

  function changeDefault() {
    let key: string | undefined = prompt.key;
    if (isDefault && allowClear) key = undefined;
    setDefault.reset();
    setDefault.mutate(key, {
      onError(cause) {
        reportError("prompt.default.update", cause);
      },
    });
  }

  return (
    <>
      <Tooltip.Root>
        <Tooltip.Anchor
          render={
            <IconButton.Root
              type="button"
              aria-busy={pending || undefined}
              aria-label={label}
              aria-pressed={isDefault}
              disabled={setDefault.isPending || (isDefault && !allowClear)}
              onClick={changeDefault}
              style={[
                promptLibraryItemStyles.action,
                isDefault && styles.selected,
                failed && styles.error,
              ]}
            >
              <IconButton.Icon render={<HugeiconsIcon icon={Bookmark02Icon} fill={fill} />} />
            </IconButton.Root>
          }
        />
        <Tooltip>{tooltip}</Tooltip>
      </Tooltip.Root>
      {failed && (
        <VisuallyHidden role="alert">Couldn't update the default {kindLabel}</VisuallyHidden>
      )}
    </>
  );
}

const styles = stylex.create({
  selected: { color: colors.foregroundAccent, opacity: { default: 1, ":disabled": 1 } },
  error: { color: colors.foregroundDanger, opacity: 1 },
});
