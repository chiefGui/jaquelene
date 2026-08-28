import { AnimatePresence, domAnimation, LazyMotion, MotionConfig } from "motion/react";
import * as m from "motion/react-m";
import type { ComponentProps, ReactElement } from "react";
import { useReducedMotion } from "./motion";

type PopoverPresenceProps = {
  children: ReactElement;
  present: boolean;
};

function PopoverPresence({ children, present }: PopoverPresenceProps) {
  const reducedMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
        <AnimatePresence initial={false}>{present ? children : null}</AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}

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
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}

export const Popover = {
  Presence: PopoverPresence,
  Surface: PopoverSurface,
} as const;
