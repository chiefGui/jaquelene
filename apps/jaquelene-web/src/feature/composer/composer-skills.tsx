import { useMenuStore } from "@ariakit/react/menu";
import { useStoreState } from "@ariakit/react/store";
import BookOpen01Icon from "@hugeicons/core-free-icons/BookOpen01Icon";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import ArrowReloadHorizontalIcon from "@hugeicons/core-free-icons/ArrowReloadHorizontalIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import type { ModelConfigurationSelection } from "@jaquelene/ipc/renderer";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "@jaquelene/ui/menu";
import { useLayoutEffect } from "react";
import { composerSkillsQuery } from "@/feature/composer-skill/query";
import { useComposerSkill } from "@/feature/composer-skill/use-composer-skill";
import { Composer, useComposer } from "./composer";

export function ComposerSkills({
  threadId,
  configuration,
  configurationPending,
  disabled = false,
}: {
  threadId: string;
  configuration: ModelConfigurationSelection | null;
  configurationPending: boolean;
  disabled?: boolean;
}) {
  const { pending, input } = useComposer();
  const menu = useMenuStore();
  const open = useStoreState(menu, "open");
  const skills = useQuery(composerSkillsQuery);
  const execution = useComposerSkill({
    threadId,
    configuration,
    configurationPending,
    blocked: pending || disabled,
    onDelivered: () => input.current?.focus(),
  });
  const { generation, cancellation, unavailable } = execution;

  useLayoutEffect(() => {
    if (unavailable) {
      menu.hideAll();
    }
  }, [menu, unavailable]);

  let feedback;
  if (generation.isPending) {
    let progress = "Generating response…";
    if (cancellation.isPending || cancellation.isSuccess) progress = "Cancelling…";
    feedback = (
      <>
        <Composer.Status role="status">{progress}</Composer.Status>
        <Composer.ToolbarAction
          label="Cancel generation"
          disabled={cancellation.isPending || cancellation.isSuccess}
          render={
            <IconButton.Root
              aria-label="Cancel generation"
              shape="squircle"
              size="small"
              onClick={() => cancellation.mutate()}
            >
              <IconButton.Icon render={<HugeiconsIcon icon={Cancel01Icon} />} />
            </IconButton.Root>
          }
        />
      </>
    );
  } else if (
    generation.isError ||
    generation.data?.status === "failed" ||
    generation.data?.status === "draft-changed"
  ) {
    let message = "Could not generate a response.";
    if (generation.data?.status === "failed") message = generation.data.message;
    if (generation.data?.status === "draft-changed") message = "Draft changed. Your text was kept.";
    feedback = (
      <>
        <Composer.Status role="alert">{message}</Composer.Status>
        <Composer.ToolbarAction
          label="Retry generation"
          disabled={unavailable}
          render={
            <IconButton.Root
              aria-label="Retry generation"
              shape="squircle"
              size="small"
              onClick={execution.retry}
            >
              <IconButton.Icon render={<HugeiconsIcon icon={ArrowReloadHorizontalIcon} />} />
            </IconButton.Root>
          }
        />
        <Composer.ToolbarAction
          label="Dismiss"
          render={
            <IconButton.Root
              aria-label="Dismiss"
              shape="squircle"
              size="small"
              onClick={() => generation.reset()}
            >
              <IconButton.Icon render={<HugeiconsIcon icon={Cancel01Icon} />} />
            </IconButton.Root>
          }
        />
      </>
    );
  }

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
                <Menu.Item key={skill.id} onClick={() => execution.select(skill)}>
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
      {feedback}
      {cancellation.isError && generation.isPending && (
        <Composer.Status role="alert">Could not cancel. Try again.</Composer.Status>
      )}
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
