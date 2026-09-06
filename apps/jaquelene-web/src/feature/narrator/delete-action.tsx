import { PromptDeleteAction, type PromptDeleteActionProps } from "@/feature/prompt/delete-action";

type NarratorPromptDeleteActionProps = Omit<PromptDeleteActionProps, "description"> & {
  isDefault: boolean;
};

export function NarratorPromptDeleteAction({
  isDefault,
  ...props
}: NarratorPromptDeleteActionProps) {
  let description =
    "Campaigns using this narrator will use the default instead. This can't be undone.";
  if (isDefault) {
    description = "The built-in narrator will replace it as the default. This can't be undone.";
  }
  return <PromptDeleteAction {...props} description={description} />;
}
