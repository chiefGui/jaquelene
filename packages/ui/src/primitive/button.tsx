import {
  Button as AriakitButton,
  type ButtonProps as AriakitButtonProps,
} from "@ariakit/react/button";
import { tv, type VariantProps } from "tailwind-variants/lite";
import type { ComponentProps } from "react";
import { cn } from "../util/cn";

const buttonClassName = tv({
  base: "inline-flex h-control shrink-0 items-center justify-center rounded-md px-3 text-sm font-medium outline-none aria-disabled:opacity-50 data-focus-visible:outline-1 data-focus-visible:outline-offset-2 data-focus-visible:outline-muted disabled:opacity-50",
  variants: {
    variant: {
      solid: "bg-foreground/90 text-canvas not-disabled:hover:bg-foreground",
      ghost: "not-disabled:hover:bg-border",
    },
  },
  defaultVariants: {
    variant: "solid",
  },
});

export type ButtonProps = AriakitButtonProps & VariantProps<typeof buttonClassName>;

function ButtonLabel({ className, ...props }: ComponentProps<"span">) {
  return <span {...props} className={cn("text-box-trim", className)} />;
}

function ButtonRoot({ children, className, variant, ...props }: ButtonProps) {
  const content =
    typeof children === "string" || typeof children === "number" ? (
      <ButtonLabel>{children}</ButtonLabel>
    ) : (
      children
    );

  return (
    <AriakitButton {...props} className={cn(buttonClassName({ variant }), className)}>
      {content}
    </AriakitButton>
  );
}

export const Button = Object.assign(ButtonRoot, { Label: ButtonLabel });
