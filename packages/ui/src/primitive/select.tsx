import {
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  ComboboxSelect,
  ComboboxSelectedValue,
  useComboboxContext,
  type ComboboxItemProps,
  type ComboboxPopoverProps,
  type ComboboxProviderProps,
  type ComboboxSelectProps,
} from "@ariakit/react/combobox";
import { useStoreState } from "@ariakit/react/store";
import type { ComponentProps } from "react";
import { cn } from "../util/cn";
import { Popover } from "./popover";

export type SelectProps = ComboboxSelectProps;

function SelectRoot({ children, ...props }: ComboboxProviderProps<string>) {
  return (
    <ComboboxProvider selectOnMove={false} focusLoop placement="bottom-end" {...props}>
      {children}
    </ComboboxProvider>
  );
}

function SelectTrigger({ children, className, ...props }: SelectProps) {
  return (
    <ComboboxSelect
      {...props}
      className={cn(
        "group inline-flex h-control shrink-0 items-center justify-between gap-3 rounded-md bg-foreground/[0.035] px-2.5 text-sm font-medium text-foreground/80 ring-inset ring-transparent outline-none not-disabled:hover:bg-foreground/6 disabled:opacity-50 data-focus-visible:ring-1 data-focus-visible:ring-foreground/25 aria-expanded:ring-1 aria-expanded:ring-foreground/25",
        className,
      )}
    >
      {children ?? <SelectValue />}
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

type SelectValueProps = ComponentProps<"span"> & { fallback?: string };

function SelectValue({ children, className, fallback, ...props }: SelectValueProps) {
  return (
    <span {...props} className={cn("min-w-0 text-box-trim", className)}>
      {children ?? <ComboboxSelectedValue fallback={fallback ?? ""} />}
    </span>
  );
}

type SelectContentProps = Omit<ComboboxPopoverProps, "alwaysVisible" | "render" | "unmountOnHide">;

function SelectContent({ className, ...props }: SelectContentProps) {
  const combobox = useComboboxContext();
  const mounted = useStoreState(combobox, "mounted") ?? false;

  return (
    <Popover.Presence present={mounted}>
      <ComboboxPopover
        portal
        gutter={8}
        sameWidth
        {...props}
        alwaysVisible
        render={<Popover.Surface />}
        className={cn(
          "z-50 overflow-hidden rounded-lg border border-surface-raised-border bg-surface-raised p-1 text-foreground shadow-2xl outline-none",
          className,
        )}
      />
    </Popover.Presence>
  );
}

function SelectItem({ className, ...props }: ComboboxItemProps) {
  return (
    <ComboboxItem
      {...props}
      className={cn(
        "group flex h-control items-center justify-between gap-3 rounded-md px-2.5 text-sm text-muted outline-none hover:bg-foreground/[0.055] hover:text-foreground focus:bg-foreground/[0.055] focus:text-foreground data-active-item:bg-foreground/[0.055] data-active-item:text-foreground aria-selected:text-foreground",
        className,
      )}
    />
  );
}

function SelectItemText({ className, ...props }: ComponentProps<"span">) {
  return <span {...props} className={cn("min-w-0 text-box-trim", className)} />;
}

function SelectIndicator({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className={cn("size-4 shrink-0 opacity-0 group-aria-selected:opacity-100", className)}
    >
      <path
        d="m3.75 8 2.75 2.75 5.75-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export const Select = Object.assign(SelectTrigger, {
  Root: SelectRoot,
  Value: SelectValue,
  Content: SelectContent,
  Item: SelectItem,
  ItemText: SelectItemText,
  Indicator: SelectIndicator,
});
