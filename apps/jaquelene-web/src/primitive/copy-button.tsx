import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import { Button, type ButtonProps } from "@jaquelene/ui";
import { radii } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { clipboard } from "@/clipboard/clipboard";
import { reportError } from "@/feature/diagnostics/diagnostics";

type CopyButtonProps = Omit<ButtonProps, "children" | "onClick" | "aria-label"> & {
  text: string;
  onCopied?: () => void;
};

export function CopyButton(props: CopyButtonProps) {
  return <CopyTextButton key={props.text} {...props} />;
}

function CopyTextButton({ text, onCopied, disabled, style, ...props }: CopyButtonProps) {
  const { mutate, status, reset } = useMutation({
    mutationFn: () => clipboard.writeText(text),
    networkMode: "always",
    retry: false,
    gcTime: 0,
    onError: (error) => reportError("clipboard.write", error),
  });

  useEffect(() => {
    if (status !== "success") return;
    const timeout = setTimeout(() => {
      reset();
      onCopied?.();
    }, 1200);
    return () => clearTimeout(timeout);
  }, [status, reset, onCopied]);

  let label = "Copy";
  let announcement = "";
  if (status === "pending") label = "Copying…";
  if (status === "success") {
    label = "Copied";
    announcement = "Copied to clipboard.";
  }
  if (status === "error") {
    label = "Retry copy";
    announcement = "Couldn't copy to clipboard. Try again.";
  }

  return (
    <>
      <Button
        type="button"
        size="small"
        variant="ghost"
        {...props}
        disabled={disabled || status === "pending"}
        accessibleWhenDisabled
        aria-busy={status === "pending"}
        aria-label={label}
        onClick={() => mutate()}
        style={[styles.button, style]}
      >
        {label}
      </Button>
      <VisuallyHidden role="status">{announcement}</VisuallyHidden>
    </>
  );
}

const styles = stylex.create({
  button: {
    borderRadius: radii.full,
    minWidth: "6rem",
  },
});
