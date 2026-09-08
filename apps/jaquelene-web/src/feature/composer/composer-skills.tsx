import { useMenuStore } from "@ariakit/react/menu";
import { useStoreState } from "@ariakit/react/store";
import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton } from "@jaquelene/ui";
import { Menu } from "@jaquelene/ui/menu";
import { useLayoutEffect } from "react";
import { Composer, useComposer } from "./composer";

export function ComposerSkills({ disabled = false }: { disabled?: boolean }) {
  const { pending, input } = useComposer();
  const menu = useMenuStore();
  const open = useStoreState(menu, "open");
  const unavailable = pending || disabled;

  useLayoutEffect(() => {
    if (unavailable) menu.hideAll();
  }, [menu, unavailable]);

  return (
    <Menu.Root store={menu} placement="top-start">
      <Composer.ToolbarAction
        label="Skills"
        disabled={unavailable}
        tooltipDisabled={open}
        render={
          <Menu.Trigger
            render={
              <IconButton.Root aria-label="Skills" shape="squircle" size="small">
                <IconButton.Icon render={<HugeiconsIcon icon={BookOpen01Icon} />} />
              </IconButton.Root>
            }
          />
        }
      />
      <Menu.Content aria-label="Skills" {...(unavailable && { finalFocus: input })}>
        <Menu.Submenu>
          <Menu.SubmenuTrigger>Generate…</Menu.SubmenuTrigger>
          <Menu.Content aria-label="Generate" {...(unavailable && { finalFocus: input })}>
            <Menu.Item>Continue</Menu.Item>
          </Menu.Content>
        </Menu.Submenu>
      </Menu.Content>
    </Menu.Root>
  );
}
