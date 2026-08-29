import {
  Tooltip as AriakitTooltip,
  TooltipAnchor,
  TooltipArrow,
  TooltipProvider,
  useTooltipContext,
  type TooltipAnchorProps,
  type TooltipProps as AriakitTooltipProps,
  type TooltipProviderProps,
} from "@ariakit/react/tooltip";
import { useStoreState } from "@ariakit/react/store";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { tokens } from "../theme.stylex";
import { Popover } from "./popover";

export type TooltipProps = Omit<
  AriakitTooltipProps,
  "alwaysVisible" | "className" | "render" | "style" | "unmountOnHide"
> & {
  style?: StyleXStyles;
};

function getTooltipSide(placement: string | undefined) {
  if (placement?.startsWith("bottom")) return "bottom";
  if (placement?.startsWith("left")) return "left";
  if (placement?.startsWith("right")) return "right";
  if (placement?.startsWith("top")) return "top";
  return undefined;
}

function TooltipContent({ children, gutter = 4, style, ...props }: TooltipProps) {
  const tooltip = useTooltipContext();
  const mounted = useStoreState(tooltip, "mounted") ?? false;
  const placement = useStoreState(tooltip, "currentPlacement");

  return (
    <Popover.Presence present={mounted}>
      <AriakitTooltip
        {...props}
        gutter={gutter}
        alwaysVisible
        render={<Popover.Surface side={getTooltipSide(placement)} />}
        {...stylex.props(styles.content, style)}
      >
        <TooltipArrow size={12} />
        {children}
      </AriakitTooltip>
    </Popover.Presence>
  );
}

export const Tooltip = Object.assign(TooltipContent, {
  Root: TooltipProvider,
  Anchor: TooltipAnchor,
});

export type { TooltipAnchorProps, TooltipProviderProps as TooltipRootProps };

const styles = stylex.create({
  content: {
    backgroundColor: tokens.surfaceRaised,
    borderColor: tokens.surfaceRaisedBorder,
    borderRadius: tokens.radiusMedium,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowLarge,
    color: tokens.foreground,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    maxWidth: "16rem",
    outline: "none",
    paddingBlock: "0.375rem",
    paddingInline: "0.5rem",
    zIndex: 50,
  },
});
