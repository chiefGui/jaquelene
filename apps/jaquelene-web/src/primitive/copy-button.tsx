import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import { useTooltipStore } from "@ariakit/react/tooltip";
import ClipboardIcon from "@hugeicons/core-free-icons/ClipboardIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton, type IconButtonProps } from "@jaquelene/ui";
import { Tooltip } from "@jaquelene/ui/tooltip";
import { radii } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { clipboard } from "@/clipboard/clipboard";
import { reportError } from "@/feature/diagnostics/diagnostics";

type CopyButtonProps = Omit<IconButtonProps, "children" | "onClick" | "aria-label"> & {
  "aria-label"?: string;
  text: string;
  onCopied?: () => void;
};

export function CopyButton(props: CopyButtonProps) {
  return <CopyTextButton key={props.text} {...props} />;
}

function CopyTextButton({ text, onCopied, style, ...props }: CopyButtonProps) {
  const tooltip = useTooltipStore();
  const { mutate, status, error, reset } = useMutation({
    mutationFn: () => clipboard.writeText(text),
    networkMode: "always",
    retry: false,
    gcTime: 0,
    onError: (error) => reportError("clipboard.write", error),
    onSettled: () => tooltip.show(),
  });

  useEffect(() => {
    if (status !== "success") return;
    const timeout = setTimeout(() => {
      tooltip.hide();
      reset();
      onCopied?.();
    }, 1200);
    return () => clearTimeout(timeout);
  }, [status, reset, onCopied, tooltip]);

  let label = "Copy";
  let announcement = "";
  if (status === "success") {
    label = "Copied";
    announcement = "Copied to clipboard.";
  }
  if (status === "error") {
    label = "Retry copy";
    announcement = error.message;
  }

  return (
    <>
      <Tooltip.Root store={tooltip}>
        <Tooltip.Anchor
          render={
            <IconButton.Root
              type="button"
              size="small"
              aria-label={label}
              {...props}
              accessibleWhenDisabled
              onClick={() => {
                if (status === "pending") return;
                mutate();
              }}
              style={[styles.button, style]}
            >
              <IconButton.Icon render={<HugeiconsIcon icon={ClipboardIcon} />} />
            </IconButton.Root>
          }
        />
        <Tooltip style={styles.tooltip}>{label}</Tooltip>
      </Tooltip.Root>
      <VisuallyHidden role="status">{announcement}</VisuallyHidden>
    </>
  );
}

const styles = stylex.create({
  button: {
    borderRadius: radii.full,
  },
  tooltip: {
    minWidth: "5rem",
    textAlign: "center",
  },
});
