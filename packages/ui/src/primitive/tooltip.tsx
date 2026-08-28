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
import { cn } from "../util/cn";
import { Popover } from "./popover";

export type TooltipProps = Omit<AriakitTooltipProps, "alwaysVisible" | "render" | "unmountOnHide">;

function getTooltipSide(placement: string | undefined) {
  if (placement?.startsWith("bottom")) return "bottom";
  if (placement?.startsWith("left")) return "left";
  if (placement?.startsWith("right")) return "right";
  if (placement?.startsWith("top")) return "top";
  return undefined;
}

function TooltipContent({ children, className, gutter = 4, ...props }: TooltipProps) {
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
        className={cn(
          "z-50 max-w-64 rounded-md border border-surface-raised-border bg-surface-raised px-2 py-1.5 text-xs text-foreground shadow-xl outline-none",
          className,
        )}
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
