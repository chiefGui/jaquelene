import { Role, type RoleProps } from "@ariakit/react/role";
import {
  Chip,
  type ChipActionProps,
  type ChipEndEdge,
  type ChipFrameProps,
  type ChipStartEdge,
} from "@jaquelene/ui";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { Children, cloneElement, createContext, isValidElement, useContext } from "react";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

type BreadcrumbLinkProps = ChipActionProps & {
  render: NonNullable<ChipActionProps["render"]>;
};

type BreadcrumbPageProps = ChipFrameProps;

type BreadcrumbItemPosition = "first" | "last" | "middle" | "only";

type BreadcrumbItemProps = StyleableProps<RoleProps<"li">> & {
  position?: BreadcrumbItemPosition;
};

const BreadcrumbItemPositionContext = createContext<BreadcrumbItemPosition>("only");

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
              position:
                items.length === 1
                  ? "only"
                  : index === 0
                    ? "first"
                    : index === items.length - 1
                      ? "last"
                      : "middle",
            })
          : item,
      )}
    </Role.ol>
  );
}

function BreadcrumbItem({ children, position = "only", style, ...props }: BreadcrumbItemProps) {
  const edges = getEdges(position);

  return (
    <BreadcrumbItemPositionContext value={position}>
      <Role.li {...props} {...stylex.props(styles.item, style)}>
        {position === "middle" || position === "last" ? (
          <Chip.Divider style={styles.divider} />
        ) : null}
        {typeof children === "string" || typeof children === "number" ? (
          <Chip.Frame {...edges} compound>
            {children}
          </Chip.Frame>
        ) : (
          children
        )}
      </Role.li>
    </BreadcrumbItemPositionContext>
  );
}

function BreadcrumbLink({ style, ...props }: BreadcrumbLinkProps) {
  const edges = getEdges(useContext(BreadcrumbItemPositionContext));

  return <Chip.Action {...props} {...edges} compound style={style} />;
}

function BreadcrumbPage({ style, ...props }: BreadcrumbPageProps) {
  const edges = getEdges(useContext(BreadcrumbItemPositionContext));

  return (
    <Chip.Frame {...props} {...edges} aria-current="page" compound style={[styles.page, style]} />
  );
}

function getEdges(position: BreadcrumbItemPosition): {
  endEdge: ChipEndEdge;
  startEdge: ChipStartEdge;
} {
  return {
    endEdge: position === "last" || position === "only" ? "rounded" : "pointed",
    startEdge: position === "first" || position === "only" ? "rounded" : "notched",
  };
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
  divider: {
    left: 0,
    position: "absolute",
    top: "-0.0625rem",
    zIndex: 1,
  },
  list: {
    alignItems: "center",
    backgroundColor: colors.backgroundSubtle,
    borderColor: colors.borderDefault,
    borderRadius: tokens.radiusMedium,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    height: "1.375rem",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
  },
  item: {
    alignItems: "center",
    color: colors.foregroundSecondary,
    display: "flex",
    height: "1.25rem",
    marginInlineStart: {
      default: "-0.375rem",
      ":first-child": 0,
    },
    minWidth: 0,
    position: "relative",
  },
  page: {
    color: colors.foregroundPrimary,
  },
});
