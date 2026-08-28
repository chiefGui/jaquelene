import { Role, type RoleProps } from "@ariakit/react/role";
import { cn } from "@jaquelene/ui";

function BreadcrumbRoot({ "aria-label": ariaLabel = "Breadcrumb", ...props }: RoleProps<"nav">) {
  return <Role.nav aria-label={ariaLabel} {...props} />;
}

function BreadcrumbList(props: RoleProps<"ol">) {
  return <Role.ol {...props} />;
}

function BreadcrumbItem({ className, ...props }: RoleProps<"li">) {
  return <Role.li {...props} className={cn("text-box-trim", className)} />;
}

function BreadcrumbLink({ className, ...props }: RoleProps<"a">) {
  return <Role.a {...props} className={cn("text-box-trim", className)} />;
}

function BreadcrumbPage({ className, ...props }: RoleProps<"span">) {
  return <Role.span {...props} aria-current="page" className={cn("text-box-trim", className)} />;
}

function BreadcrumbSeparator({ children = ">", className, ...props }: RoleProps<"li">) {
  return (
    <Role.li
      {...props}
      role="presentation"
      aria-hidden="true"
      className={cn("text-box-trim", className)}
    >
      {children}
    </Role.li>
  );
}

export const Breadcrumb = {
  Root: BreadcrumbRoot,
  List: BreadcrumbList,
  Item: BreadcrumbItem,
  Link: BreadcrumbLink,
  Page: BreadcrumbPage,
  Separator: BreadcrumbSeparator,
} as const;
