import { Role, type RoleProps } from "@ariakit/react/role";
import { cn } from "../util/cn";

export type InputProps = Omit<RoleProps<"input">, "render">;

export function Input({ className, ...props }: InputProps) {
  return (
    <Role.input
      {...props}
      className={cn(
        "h-8 rounded-md border border-border bg-canvas px-3 text-sm outline-none placeholder:text-muted focus:border-muted disabled:opacity-50",
        className,
      )}
    />
  );
}
