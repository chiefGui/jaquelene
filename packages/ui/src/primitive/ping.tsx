import { cn } from "../util/cn";

export type PingProps = {
  className?: string;
};

export function Ping({ className }: PingProps) {
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-2 shrink-0", className)}>
      <span className="absolute size-full rounded-full bg-current opacity-25 motion-safe:animate-ping motion-safe:[animation-duration:2s] motion-reduce:hidden" />
      <span className="relative size-full rounded-full bg-current" />
    </span>
  );
}
