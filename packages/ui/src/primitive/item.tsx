import { Role, type RoleProps } from "@ariakit/react/role";
import { cn } from "../util/cn";

function ItemGroup({ className, ...props }: RoleProps<"div">) {
  return (
    <Role.div
      {...props}
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border bg-foreground/2",
        className,
      )}
    />
  );
}

function ItemRoot({ className, ...props }: RoleProps<"div">) {
  return (
    <Role.div
      {...props}
      className={cn("flex min-h-14 items-center justify-between gap-8 p-4", className)}
    />
  );
}

function ItemContent({ className, ...props }: RoleProps<"div">) {
  return <Role.div {...props} className={cn("min-w-0", className)} />;
}

function ItemLabel({ className, ...props }: RoleProps<"div">) {
  return <Role.div {...props} className={cn("text-sm font-medium text-foreground", className)} />;
}

function ItemDescription({ className, ...props }: RoleProps<"div">) {
  return <Role.div {...props} className={cn("mt-0.5 text-sm leading-5 text-muted", className)} />;
}

function ItemValue({ className, ...props }: RoleProps<"div">) {
  return (
    <Role.div
      {...props}
      className={cn("shrink-0 text-sm text-foreground/75 tabular-nums", className)}
    />
  );
}

export const Item = {
  Group: ItemGroup,
  Root: ItemRoot,
  Content: ItemContent,
  Label: ItemLabel,
  Description: ItemDescription,
  Value: ItemValue,
} as const;
