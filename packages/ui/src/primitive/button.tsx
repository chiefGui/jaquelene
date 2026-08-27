import {
  Button as AriakitButton,
  type ButtonProps as AriakitButtonProps,
} from "@ariakit/react/button";
import { cn } from "../util/cn";

export type ButtonProps = Omit<AriakitButtonProps, "render">;

export function Button({ className, ...props }: ButtonProps) {
  return (
    <AriakitButton
      {...props}
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-canvas outline-none transition-opacity aria-disabled:opacity-50 data-focus-visible:outline-1 data-focus-visible:outline-offset-2 data-focus-visible:outline-muted disabled:opacity-50",
        className,
      )}
    />
  );
}
