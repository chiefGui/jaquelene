import type { ComponentProps } from "react";
import { cn } from "../util/cn";

export type SkeletonProps = Omit<ComponentProps<"div">, "aria-hidden" | "children">;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn("rounded-md bg-accent/10 motion-safe:animate-pulse", className)}
    />
  );
}
