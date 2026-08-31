import { Role, type RoleProps } from "@ariakit/react/role";
import { Chip, type ChipActionProps, type ChipFrameProps } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

type BreadcrumbLinkProps = ChipActionProps & {
  render: NonNullable<ChipActionProps["render"]>;
};

type BreadcrumbPageProps = ChipFrameProps;

function BreadcrumbRoot({
  "aria-label": ariaLabel = "Breadcrumb",
  style,
  ...props
}: StyleableProps<RoleProps<"nav">>) {
  return <Role.nav aria-label={ariaLabel} {...props} {...stylex.props(styles.root, style)} />;
}

function BreadcrumbList({ style, ...props }: StyleableProps<RoleProps<"ol">>) {
  return <Role.ol {...props} {...stylex.props(styles.list, style)} />;
}

function BreadcrumbItem({ children, style, ...props }: StyleableProps<RoleProps<"li">>) {
  return (
    <Role.li {...props} {...stylex.props(styles.item, style)}>
      {typeof children === "string" || typeof children === "number" ? (
        <Chip.Frame>{children}</Chip.Frame>
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
  return <Chip.Frame {...props} aria-current="page" style={[styles.page, style]} />;
}

function BreadcrumbSeparator({
  style,
  ...props
}: Omit<StyleableProps<RoleProps<"li">>, "children">) {
  return (
    <Role.li
      {...props}
      role="presentation"
      aria-hidden="true"
      {...stylex.props(styles.separator, style)}
    >
      <svg
        viewBox="0 0 8 1"
        preserveAspectRatio="none"
        focusable="false"
        {...stylex.props(styles.separatorIcon)}
      >
        <path
          d="M0 0L8 .5L0 1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
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

const styles = stylex.create({
  root: {
    height: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  list: {
    alignItems: "center",
    display: "flex",
    height: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  item: {
    alignItems: "center",
    color: tokens.muted,
    display: "flex",
    height: "100%",
    minWidth: 0,
    paddingInlineEnd: {
      default: "0.375rem",
      ":last-child": 0,
    },
    paddingInlineStart: {
      default: "0.625rem",
      ":first-child": 0,
    },
  },
  page: {
    color: tokens.foreground,
  },
  separator: {
    color: tokens.border,
    flexShrink: 0,
    height: "100%",
    width: "0.5rem",
  },
  separatorIcon: {
    display: "block",
    height: "100%",
    overflow: "visible",
    width: "100%",
  },
});
