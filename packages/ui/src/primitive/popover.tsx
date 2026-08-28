import { AnimatePresence, domAnimation, LazyMotion, MotionConfig } from "motion/react";
import * as m from "motion/react-m";
import type { ComponentProps, ReactElement } from "react";

type PopoverPresenceProps = {
  children: ReactElement;
  present: boolean;
};

function PopoverPresence({ children, present }: PopoverPresenceProps) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <AnimatePresence initial={false}>{present ? children : null}</AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}

type PopoverSurfaceProps = Omit<
  ComponentProps<typeof m.div>,
  "animate" | "exit" | "initial" | "transition"
>;

function PopoverSurface(props: PopoverSurfaceProps) {
  return (
    <m.div
      {...props}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}

export const Popover = {
  Presence: PopoverPresence,
  Surface: PopoverSurface,
} as const;
