import type { ComponentProps } from "react";
import { cn } from "../util/cn";
import { useReducedMotion } from "./motion";

export type SkeletonProps = Omit<ComponentProps<"div">, "aria-hidden" | "children">;

export function Skeleton({ className, ...props }: SkeletonProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn("rounded-md bg-accent/10", !reducedMotion && "animate-pulse", className)}
    />
  );
}
