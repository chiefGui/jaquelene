import { Role, type RoleProps } from "@ariakit/react/role";

function BreadcrumbRoot({ "aria-label": ariaLabel = "Breadcrumb", ...props }: RoleProps<"nav">) {
  return <Role.nav aria-label={ariaLabel} {...props} />;
}

function BreadcrumbList(props: RoleProps<"ol">) {
  return <Role.ol {...props} />;
}

function BreadcrumbItem(props: RoleProps<"li">) {
  return <Role.li {...props} />;
}

function BreadcrumbLink(props: RoleProps<"a">) {
  return <Role.a {...props} />;
}

function BreadcrumbPage(props: RoleProps<"span">) {
  return <Role.span {...props} aria-current="page" />;
}

function BreadcrumbSeparator({ children = ">", ...props }: RoleProps<"li">) {
  return (
    <Role.li {...props} role="presentation" aria-hidden="true">
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
