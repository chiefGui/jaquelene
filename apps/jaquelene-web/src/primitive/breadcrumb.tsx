import { Role, type RoleProps } from "@ariakit/react/role";
import { Chip, ControlIcon, type ChipActionProps } from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { Children, cloneElement, isValidElement, type ComponentProps } from "react";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

type BreadcrumbLinkProps = ChipActionProps & {
  render: NonNullable<ChipActionProps["render"]>;
};

type BreadcrumbLabelProps = StyleableProps<ComponentProps<"span">>;

type BreadcrumbPageProps = BreadcrumbLabelProps;

type BreadcrumbItemProps = StyleableProps<RoleProps<"li">> & {
  showSeparator?: boolean;
};

function BreadcrumbRoot({
  "aria-label": ariaLabel = "Breadcrumb",
  style,
  ...props
}: StyleableProps<RoleProps<"nav">>) {
  return <Role.nav aria-label={ariaLabel} {...props} {...stylex.props(styles.root, style)} />;
}

function BreadcrumbList({ children, style, ...props }: StyleableProps<RoleProps<"ol">>) {
  const items = Children.toArray(children);

  return (
    <Role.ol {...props} {...stylex.props(styles.list, style)}>
      {items.map((item, index) =>
        isValidElement<BreadcrumbItemProps>(item)
          ? cloneElement(item, {
              showSeparator: index > 0,
            })
          : item,
      )}
    </Role.ol>
  );
}

function BreadcrumbItem({ children, showSeparator = false, style, ...props }: BreadcrumbItemProps) {
  return (
    <Role.li {...props} {...stylex.props(styles.item, style)}>
      {showSeparator ? <BreadcrumbSeparator /> : null}
      {typeof children === "string" || typeof children === "number" ? (
        <BreadcrumbLabel>{children}</BreadcrumbLabel>
      ) : (
        children
      )}
    </Role.li>
  );
}

function BreadcrumbLink({ style, ...props }: BreadcrumbLinkProps) {
  return <Chip.Action {...props} style={style} />;
}

function BreadcrumbPage({ style, ...props }: BreadcrumbPageProps) {
  return <BreadcrumbLabel {...props} aria-current="page" style={[styles.page, style]} />;
}

function BreadcrumbLabel({ style, ...props }: BreadcrumbLabelProps) {
  return <span {...props} {...stylex.props(styles.label, style)} />;
}

function BreadcrumbSeparator() {
  return <ControlIcon.Chevron style={styles.separator} />;
}

export const Breadcrumb = {
  Root: BreadcrumbRoot,
  List: BreadcrumbList,
  Item: BreadcrumbItem,
  Link: BreadcrumbLink,
  Page: BreadcrumbPage,
} as const;

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    height: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  list: {
    alignItems: "center",
    display: "flex",
    fontSize: tokens.fontSizeSmall,
    fontWeight: 400,
    gap: "0.1875rem",
    height: "100%",
    lineHeight: tokens.lineHeightSmall,
    maxWidth: "100%",
    minWidth: 0,
  },
  item: {
    alignItems: "center",
    color: colors.foregroundSecondary,
    display: "flex",
    gap: "0.1875rem",
    height: "100%",
    minWidth: 0,
  },
  label: {
    minWidth: 0,
    overflow: "hidden",
    textBox: "trim-both text",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  page: {
    color: colors.foregroundPrimary,
  },
  separator: {
    color: `color-mix(in oklch, ${colors.foregroundSecondary} 50%, transparent)`,
    flexShrink: 0,
    height: "0.75rem",
    width: "0.75rem",
  },
});
