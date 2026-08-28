import {
  ComboboxSelect,
  ComboboxSelectedValue,
  type ComboboxSelectProps,
} from "@ariakit/react/combobox";
import { cn } from "../util/cn";

export type SelectProps = ComboboxSelectProps;

export function Select({ children, className, ...props }: SelectProps) {
  return (
    <ComboboxSelect
      {...props}
      className={cn(
        "group inline-flex h-control shrink-0 items-center justify-between gap-3 rounded-md bg-foreground/[0.035] px-2.5 text-sm font-medium text-foreground/80 ring-inset ring-transparent outline-none not-disabled:hover:bg-foreground/6 disabled:opacity-50 data-focus-visible:ring-1 data-focus-visible:ring-foreground/25 aria-expanded:ring-1 aria-expanded:ring-foreground/25",
        className,
      )}
    >
      {children ?? <ComboboxSelectedValue />}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className="size-3.5 shrink-0 text-muted group-data-focus-visible:-rotate-90 group-aria-expanded:-rotate-90"
      >
        <path
          d="m4.5 6 3.5 3.5L11.5 6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    </ComboboxSelect>
  );
}
