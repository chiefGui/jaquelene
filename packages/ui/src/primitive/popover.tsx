import * as m from "motion/react-m";
import type { ComponentProps } from "react";
import { MotionPresence, overlayTransition } from "./motion";

type PopoverSurfaceProps = Omit<
  ComponentProps<typeof m.div>,
  "animate" | "exit" | "initial" | "transition"
> & {
  side?: "bottom" | "left" | "right" | "top" | undefined;
};

const surfaceMotion = {
  bottom: { offset: { y: -4 }, transformOrigin: "center top" },
  left: { offset: { x: 4 }, transformOrigin: "right center" },
  right: { offset: { x: -4 }, transformOrigin: "left center" },
  top: { offset: { y: 4 }, transformOrigin: "center bottom" },
} as const;

function PopoverSurface({ side, style, ...props }: PopoverSurfaceProps) {
  const motion = side ? surfaceMotion[side] : undefined;

  return (
    <m.div
      {...props}
      style={{ transformOrigin: motion?.transformOrigin, ...style }}
      initial={{ opacity: 0, scale: 0.98, ...motion?.offset }}
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, ...motion?.offset }}
      transition={overlayTransition}
    />
  );
}

export const Popover = {
  Presence: MotionPresence,
  Surface: PopoverSurface,
} as const;
