import {
  Dialog as AriakitDialog,
  DialogDescription,
  DialogDisclosure,
  DialogDismiss,
  DialogHeading,
  DialogProvider,
  useDialogContext,
  type DialogProps as AriakitDialogProps,
} from "@ariakit/react/dialog";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconButton, type IconButtonProps } from "@jaquelene/ui";
import { tokens } from "@jaquelene/ui/theme.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { paneSurface } from "./pane-surface.stylex";
import { useSecondarySidebarHostElement } from "./secondary-sidebar-host";
import { shellChrome } from "./shell-chrome.stylex";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

export type SecondarySidebarContentProps = Omit<
  AriakitDialogProps,
  | "alwaysVisible"
  | "aria-modal"
  | "backdrop"
  | "className"
  | "hideOnInteractOutside"
  | "modal"
  | "onClose"
  | "open"
  | "portal"
  | "portalElement"
  | "portalRef"
  | "preventBodyScroll"
  | "preserveTabOrder"
  | "preserveTabOrderAnchor"
  | "store"
  | "style"
  | "unmountOnHide"
> & {
  style?: StyleXStyles;
};

export type SecondarySidebarRootProps = {
  children?: ReactNode;
  open: boolean;
  setOpen: (open: boolean) => void;
};

export type SecondarySidebarCloseProps = Omit<
  IconButtonProps,
  "aria-label" | "children" | "render"
> & {
  "aria-label"?: string;
};

function SecondarySidebarRoot(props: SecondarySidebarRootProps) {
  return <DialogProvider {...props} />;
}

function SecondarySidebarContent({
  "aria-label": ariaLabel = "Secondary sidebar",
  style,
  ...props
}: SecondarySidebarContentProps) {
  const element = useSecondarySidebarHostElement();
  const dialog = useDialogContext();

  if (!dialog) {
    throw new Error("SecondarySidebar.Content must be rendered inside SecondarySidebar.Root.");
  }

  if (!element) {
    return null;
  }

  return (
    <AriakitDialog
      {...props}
      store={dialog}
      aria-label={ariaLabel}
      modal={false}
      portal
      portalElement={element}
      preventBodyScroll={false}
      preserveTabOrder={false}
      hideOnInteractOutside={false}
      unmountOnHide
      {...stylex.props(paneSurface.root, styles.root, style)}
    />
  );
}

function SecondarySidebarHeader({ style, ...props }: StyleableProps<ComponentProps<"header">>) {
  return <header {...props} {...stylex.props(shellChrome.header, styles.header, style)} />;
}

function SecondarySidebarViewport({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.viewport, style)} />;
}

function SecondarySidebarBody({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.body, style)} />;
}

function SecondarySidebarClose({
  "aria-label": ariaLabel = "Close secondary sidebar",
  ...props
}: SecondarySidebarCloseProps) {
  return (
    <DialogDismiss
      render={
        <IconButton {...props} aria-label={ariaLabel}>
          <HugeiconsIcon
            icon={Cancel01Icon}
            size={16}
            color="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </IconButton>
      }
    />
  );
}

export const SecondarySidebar = {
  Root: SecondarySidebarRoot,
  Trigger: DialogDisclosure,
  Content: SecondarySidebarContent,
  Header: SecondarySidebarHeader,
  Heading: DialogHeading,
  Description: DialogDescription,
  Viewport: SecondarySidebarViewport,
  Body: SecondarySidebarBody,
  Close: SecondarySidebarClose,
  Dismiss: DialogDismiss,
} as const;

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gridColumn: 2,
    gridRow: 1,
    marginLeft: "0.5rem",
    outline: "none",
    width: "clamp(18rem, 30vw, 22rem)",
  },
  header: {
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    justifyContent: "space-between",
    paddingInlineStart: "1rem",
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  },
  body: {
    padding: "1rem",
  },
});
