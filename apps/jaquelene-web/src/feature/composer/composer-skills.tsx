import { useMenuStore } from "@ariakit/react/menu";
import { useStoreState } from "@ariakit/react/store";
import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "@jaquelene/ui/menu";
import { useLayoutEffect } from "react";
import { composerSkillsQuery } from "@/feature/composer-skill/query";
import type { ComposerSkillExecution } from "@/feature/composer-skill/use-composer-skill";
import { Composer, useComposer } from "./composer";

export function ComposerSkills({
  execution,
  disabled = false,
}: {
  execution: ComposerSkillExecution;
  disabled?: boolean;
}) {
  const { pending, input } = useComposer();
  const menu = useMenuStore();
  const open = useStoreState(menu, "open");
  const skills = useQuery(composerSkillsQuery);
  const unavailable = pending || disabled;

  useLayoutEffect(() => {
    if (unavailable) {
      menu.hideAll();
    }
  }, [menu, unavailable]);

  return (
    <>
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
              {skills.data?.map((skill) => (
                <Menu.Item
                  key={skill.id}
                  disabled={execution.unavailable}
                  onClick={() => execution.select(skill)}
                >
                  {skill.name}
                </Menu.Item>
              ))}
              {skills.isPending && <Menu.Item disabled>Loading skills…</Menu.Item>}
              {skills.isError && (
                <Menu.Item onClick={() => void skills.refetch()}>Retry loading skills</Menu.Item>
              )}
            </Menu.Content>
          </Menu.Submenu>
        </Menu.Content>
      </Menu.Root>
      <ConfirmDialog
        trigger={null}
        open={execution.confirmingReplacement}
        setOpen={(value) => {
          if (!value) execution.dismissReplacement();
        }}
        heading="Replace your draft?"
        description="Your current text will be replaced when the response is ready."
        confirmLabel="Generate response"
        finalFocus={input}
        onConfirm={execution.confirmReplacement}
      />
    </>
  );
}
