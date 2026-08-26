import { cn } from "@jaquelene/ui";
import { Role, type RoleProps } from "@ariakit/react/role";

function ItemGroup({ className, ...props }: RoleProps<"div">) {
  return (
    <Role.div
      {...props}
      className={cn(
        "divide-y divide-border overflow-hidden rounded-lg border border-border",
        className,
      )}
    />
  );
}

function ItemRoot({ className, ...props }: RoleProps<"div">) {
  return (
    <Role.div
      {...props}
      className={cn("flex items-center justify-between gap-6 px-4 py-4", className)}
    />
  );
}

function ItemContent({ className, ...props }: RoleProps<"div">) {
  return <Role.div {...props} className={cn("min-w-0", className)} />;
}

function ItemTitle({ className, ...props }: RoleProps<"div">) {
  return <Role.div {...props} className={cn("text-sm font-medium", className)} />;
}

function ItemDescription({ className, ...props }: RoleProps<"div">) {
  return <Role.div {...props} className={cn("mt-0.5 text-sm text-muted", className)} />;
}

function ItemMeta({ className, ...props }: RoleProps<"div">) {
  return (
    <Role.div {...props} className={cn("shrink-0 text-lg font-semibold tabular-nums", className)} />
  );
}

export const Item = {
  Group: ItemGroup,
  Root: ItemRoot,
  Content: ItemContent,
  Title: ItemTitle,
  Description: ItemDescription,
  Meta: ItemMeta,
} as const;
