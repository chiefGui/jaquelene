import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { IconButton, type IconButtonProps } from "@jaquelene/ui";
import { Tooltip } from "@jaquelene/ui/tooltip";

export type IconActionProps = Omit<
  IconButtonProps,
  "aria-label" | "children" | "shape" | "size" | "type"
> & {
  icon: IconSvgElement;
  label: string;
};

export function IconAction({ icon, label, ...props }: IconActionProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Anchor
        render={
          <IconButton.Root
            {...props}
            type="button"
            aria-label={label}
            shape="squircle"
            size="small"
          >
            <IconButton.Icon render={<HugeiconsIcon icon={icon} />} />
          </IconButton.Root>
        }
      />
      <Tooltip>{label}</Tooltip>
    </Tooltip.Root>
  );
}
