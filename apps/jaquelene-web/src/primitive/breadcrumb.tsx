import { Role, type RoleProps } from "@ariakit/react/role";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

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

function BreadcrumbItem({ style, ...props }: StyleableProps<RoleProps<"li">>) {
  return <Role.li {...props} {...stylex.props(styles.textBox, style)} />;
}

function BreadcrumbLink({ style, ...props }: StyleableProps<RoleProps<"a">>) {
  return <Role.a {...props} {...stylex.props(styles.link, style)} />;
}

function BreadcrumbPage({ style, ...props }: StyleableProps<RoleProps<"span">>) {
  return <Role.span {...props} aria-current="page" {...stylex.props(styles.page, style)} />;
}

function BreadcrumbSeparator({ children = ">", style, ...props }: StyleableProps<RoleProps<"li">>) {
  return (
    <Role.li
      {...props}
      role="presentation"
      aria-hidden="true"
      {...stylex.props(styles.separator, style)}
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

const styles = stylex.create({
  root: {
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    minWidth: 0,
  },
  list: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    minWidth: 0,
  },
  textBox: {
    color: tokens.muted,
    textBox: "trim-both text",
  },
  link: {
    color: {
      default: tokens.muted,
      ":hover": tokens.foreground,
    },
    outlineColor: {
      default: null,
      ":focus-visible": `color-mix(in oklab, ${tokens.accent} 60%, transparent)`,
    },
    outlineOffset: {
      default: null,
      ":focus-visible": 2,
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: {
      default: null,
      ":focus-visible": 1,
    },
    textBox: "trim-both text",
  },
  page: {
    color: tokens.foreground,
    fontWeight: 500,
    textBox: "trim-both text",
  },
  separator: {
    color: tokens.muted,
    textBox: "trim-both text",
  },
});
