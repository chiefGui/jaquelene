import { cn } from "../util/cn";
import { useReducedMotion } from "./motion";

export type PingProps = {
  className?: string;
};

export function Ping({ className }: PingProps) {
  const reducedMotion = useReducedMotion();

  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-2 shrink-0", className)}>
      {reducedMotion ? null : (
        <span className="absolute size-full animate-ping rounded-full bg-current opacity-25 [animation-duration:2s]" />
      )}
      <span className="relative size-full rounded-full bg-current" />
    </span>
  );
}
