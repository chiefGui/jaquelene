import { Role, type RoleProps } from "@ariakit/react/role";
import { cn } from "../util/cn";

export type InputProps = Omit<RoleProps<"input">, "render">;

export function Input({ className, ...props }: InputProps) {
  return (
    <Role.input
      {...props}
      className={cn(
        "h-control appearance-none rounded-md border border-foreground/10 bg-foreground/[0.035] px-2.5 text-sm text-foreground caret-accent outline-none placeholder:text-muted focus:border-accent/45 focus:bg-foreground/[0.05] disabled:opacity-50",
        className,
      )}
    />
  );
}
