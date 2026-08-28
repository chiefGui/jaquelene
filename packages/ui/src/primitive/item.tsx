import { Role, type RoleProps } from "@ariakit/react/role";
import { cn } from "../util/cn";

function ItemSection({ className, ...props }: RoleProps<"section">) {
  return <Role.section {...props} className={cn("flex flex-col gap-3", className)} />;
}

function ItemHeading({ className, ...props }: RoleProps<"h2">) {
  return (
    <Role.h2
      {...props}
      className={cn("px-4 text-sm font-medium text-foreground text-box-trim", className)}
    />
  );
}

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
  return (
    <Role.div
      {...props}
      className={cn("text-sm font-medium text-foreground text-box-trim", className)}
    />
  );
}

function ItemDescription({ className, ...props }: RoleProps<"div">) {
  return <Role.div {...props} className={cn("mt-1 text-xs text-muted", className)} />;
}

function ItemValue({ className, ...props }: RoleProps<"div">) {
  return (
    <Role.div
      {...props}
      className={cn("shrink-0 text-sm text-foreground/75 tabular-nums", className)}
    />
  );
}

function ItemValueText({ className, ...props }: RoleProps<"span">) {
  return <Role.span {...props} className={cn("text-box-trim", className)} />;
}

export const Item = {
  Section: ItemSection,
  Heading: ItemHeading,
  Group: ItemGroup,
  Root: ItemRoot,
  Content: ItemContent,
  Label: ItemLabel,
  Description: ItemDescription,
  Value: ItemValue,
  ValueText: ItemValueText,
} as const;
