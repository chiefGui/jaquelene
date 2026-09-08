import ArrowUp02Icon from "@hugeicons/core-free-icons/ArrowUp02Icon";
import Loading02Icon from "@hugeicons/core-free-icons/Loading02Icon";
import { useTooltipStore } from "@ariakit/react/tooltip";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, type ButtonProps } from "@jaquelene/ui";
import { useReducedMotion } from "@jaquelene/ui/motion";
import { Toolbar, type ToolbarProps } from "@jaquelene/ui/toolbar";
import { Tooltip } from "@jaquelene/ui/tooltip";
import { Popover } from "@jaquelene/ui/popover";
import { colors, radii, shadows, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import {
  createContext,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { Backlight } from "@/primitive/backlight/backlight";

type StyleableProps<Props> = Omit<Props, "className" | "style"> & {
  style?: StyleXStyles;
};

type ComposerContextValue = Readonly<{
  pending: boolean;
  input: RefObject<HTMLTextAreaElement | null>;
}>;

const ComposerContext = createContext<ComposerContextValue | null>(null);

export function useComposer() {
  const composer = useContext(ComposerContext);
  if (!composer) {
    throw new Error("Composer components must be used inside Composer.");
  }
  return composer;
}

function ComposerRoot({
  "aria-busy": ariaBusy,
  children,
  pending = false,
  style,
  ...props
}: StyleableProps<ComponentProps<"form">> & { pending?: boolean }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const context = useMemo(() => ({ pending, input }), [pending]);

  return (
    <ComposerContext.Provider value={context}>
      <form
        {...props}
        aria-busy={ariaBusy ?? (pending || undefined)}
        {...stylex.props(styles.root, style, stylex.defaultMarker())}
      >
        {children}
      </form>
    </ComposerContext.Provider>
  );
}

function ComposerSurface({ children, style, ...props }: StyleableProps<ComponentProps<"div">>) {
  const { pending } = useComposer();
  return (
    <div {...props} {...stylex.props(styles.chrome, styles.surface, style, stylex.defaultMarker())}>
      <Backlight active={pending} />
      {children}
    </div>
  );
}

function ComposerActivity({ children, open }: { children: ReactNode; open: boolean }) {
  return (
    <div inert={!open} aria-hidden={!open || undefined} {...stylex.props(styles.activityAnchor)}>
      <Popover.Presence present={open}>
        <Popover.Surface
          side="top"
          role="group"
          aria-label="Composer activity"
          {...stylex.props(styles.chrome, styles.activity)}
        >
          {children}
        </Popover.Surface>
      </Popover.Presence>
    </div>
  );
}

function ComposerToolbar({
  "aria-label": ariaLabel = "Composer actions",
  ref,
  style,
  ...props
}: Omit<ToolbarProps, "orientation">) {
  const { pending, input } = useComposer();
  const toolbar = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  useImperativeHandle(ref, () => toolbar.current!, []);

  useLayoutEffect(() => {
    const element = toolbar.current;
    if (!element) return;
    if (pending && element.contains(element.ownerDocument.activeElement)) {
      input.current?.focus({ preventScroll: true });
    }
    element.inert = pending;
  }, [input, pending]);

  return (
    <Toolbar.Root
      {...props}
      ref={toolbar}
      aria-label={ariaLabel}
      aria-hidden={pending || undefined}
      orientation="horizontal"
      style={[
        styles.chrome,
        styles.toolbar,
        pending && styles.toolbarHidden,
        reducedMotion && styles.toolbarReducedMotion,
        style,
      ]}
    />
  );
}

type ComposerToolbarActionProps = Omit<
  ComponentProps<typeof Toolbar.Item>,
  "aria-label" | "children" | "className" | "render" | "style" | "type"
> & {
  label: string;
  render: NonNullable<ComponentProps<typeof Toolbar.Item>["render"]>;
  tooltipDisabled?: boolean;
};

function ComposerToolbarAction({
  label,
  render,
  tooltipDisabled = false,
  ...props
}: ComposerToolbarActionProps) {
  const { pending } = useComposer();
  const tooltip = useTooltipStore();
  const tooltipUnavailable = pending || props.disabled || tooltipDisabled;

  useLayoutEffect(() => {
    if (tooltipUnavailable) tooltip.hide();
  }, [tooltip, tooltipUnavailable]);

  return (
    <Tooltip.Root store={tooltip}>
      <Tooltip.Anchor
        showOnHover={!tooltipUnavailable}
        onFocusVisible={(event) => {
          if (tooltipUnavailable) event.preventDefault();
        }}
        render={
          <Toolbar.Item
            {...props}
            type="button"
            aria-label={label}
            accessibleWhenDisabled
            render={render}
          />
        }
      />
      <Tooltip>{label}</Tooltip>
    </Tooltip.Root>
  );
}

function ComposerLabel({ style, ...props }: StyleableProps<ComponentProps<"label">>) {
  return <label {...props} {...stylex.props(styles.label, style, stylex.defaultMarker())} />;
}

function ComposerInput({
  enterKeyHint = "send",
  placeholder = "Write a message…",
  ref,
  rows = 2,
  style,
  ...props
}: StyleableProps<ComponentProps<"textarea">>) {
  const { input } = useComposer();
  useImperativeHandle(ref, () => input.current!, [input]);

  return (
    <textarea
      {...props}
      ref={input}
      enterKeyHint={enterKeyHint}
      placeholder={placeholder}
      rows={rows}
      {...stylex.props(styles.input, style, stylex.defaultMarker())}
    />
  );
}

function ComposerFooter({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.footer, style, stylex.defaultMarker())} />;
}

function ComposerControls({ style, ...props }: StyleableProps<ComponentProps<"div">>) {
  return <div {...props} {...stylex.props(styles.controls, style, stylex.defaultMarker())} />;
}

function ComposerStatus({
  style,
  tone = "muted",
  ...props
}: StyleableProps<ComponentProps<"p">> & { tone?: "danger" | "muted" }) {
  return (
    <p
      {...props}
      {...stylex.props(
        styles.status,
        tone === "danger" && styles.dangerStatus,
        style,
        stylex.defaultMarker(),
      )}
    />
  );
}

function ComposerSubmit({
  "aria-label": ariaLabel,
  disabled,
  style,
  ...props
}: Omit<ButtonProps, "children" | "type">) {
  const { pending } = useComposer();
  const reducedMotion = useReducedMotion();
  let label = "Send message";
  let icon = ArrowUp02Icon;
  if (pending) {
    label = "Generating reply";
    icon = Loading02Icon;
  }

  return (
    <Button
      {...props}
      type="submit"
      aria-busy={pending || undefined}
      aria-label={ariaLabel ?? label}
      disabled={pending || disabled === true}
      style={[styles.submit, style]}
    >
      <HugeiconsIcon
        icon={icon}
        size={17}
        strokeWidth={1.8}
        aria-hidden="true"
        {...stylex.props(pending && !reducedMotion && styles.spinning)}
      />
    </Button>
  );
}

export const Composer = Object.assign(ComposerRoot, {
  Activity: ComposerActivity,
  Surface: ComposerSurface,
  Toolbar: ComposerToolbar,
  ToolbarAction: ComposerToolbarAction,
  Label: ComposerLabel,
  Input: ComposerInput,
  Footer: ComposerFooter,
  Controls: ComposerControls,
  Status: ComposerStatus,
  Submit: ComposerSubmit,
});

const spin = stylex.keyframes({
  to: {
    transform: "rotate(360deg)",
  },
});

const styles = stylex.create({
  activityAnchor: {
    bottom: "100%",
    display: "flex",
    insetInline: 0,
    justifyContent: "center",
    paddingBottom: "0.375rem",
    pointerEvents: "none",
    position: "absolute",
    zIndex: 0,
  },
  activity: {
    alignItems: "center",
    backdropFilter: "blur(0.75rem)",
    backgroundColor: `oklch(from ${colors.backgroundSurfaceRaised} l c h / 0.96)`,
    borderRadius: radii.full,
    boxShadow: shadows.floating,
    display: "flex",
    gap: "0.375rem",
    justifyContent: "space-between",
    maxWidth: "calc(100% - 1.5rem)",
    minHeight: tokens.controlHeight,
    minWidth: "9rem",
    overflowWrap: "anywhere",
    paddingBlock: "0.25rem",
    paddingLeft: "0.75rem",
    paddingRight: "0.25rem",
    pointerEvents: "auto",
  },
  root: {
    display: "flex",
    flexDirection: "column",
    isolation: "isolate",
    position: "relative",
  },
  toolbar: {
    backdropFilter: "blur(0.75rem)",
    backgroundColor: `oklch(from ${colors.backgroundSurfaceRaised} calc(l * 0.98) c h / 0.97)`,
    backgroundImage:
      "linear-gradient(to top, rgb(0 0 0 / 20%), rgb(0 0 0 / 6%) 0.2rem, transparent 0.5rem)",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    marginInline: "0.75rem",
    minHeight: tokens.controlHeight,
    opacity: 1,
    paddingBlock: "0.375rem",
    paddingInline: "0.5rem",
    position: "relative",
    transform: "translateY(0)",
    transitionDuration: "0.12s",
    transitionProperty: "opacity, transform",
    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
    zIndex: 0,
  },
  toolbarHidden: {
    opacity: 0,
    pointerEvents: "none",
    transform: "translateY(0.5rem)",
  },
  toolbarReducedMotion: {
    transform: "none",
    transitionDuration: "0s",
  },
  chrome: {
    backgroundColor: colors.backgroundSurfaceRaised,
    borderColor: colors.borderDefault,
    borderRadius: radii.control,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadows.control,
  },
  surface: {
    borderColor: {
      default: colors.borderDefault,
      ":focus-within": colors.borderFocus,
    },
    display: "flex",
    flexDirection: "column",
    isolation: "isolate",
    padding: "0.375rem",
    position: "relative",
    zIndex: 1,
  },
  label: {
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  input: {
    appearance: "none",
    backgroundColor: "transparent",
    borderWidth: 0,
    caretColor: colors.foregroundAccent,
    color: colors.foregroundPrimary,
    fieldSizing: "content",
    fontFamily: "inherit",
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightBase,
    maxHeight: "12rem",
    minHeight: "3.75rem",
    outline: "none",
    overflowY: "auto",
    paddingBlock: "0.625rem",
    paddingInline: "0.625rem",
    position: "relative",
    resize: "none",
    width: "100%",
    zIndex: 1,
    "::placeholder": {
      color: colors.foregroundSecondary,
    },
  },
  footer: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    minHeight: tokens.controlHeight,
    paddingLeft: "0.625rem",
    position: "relative",
    zIndex: 1,
  },
  controls: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: "0.5rem",
    minWidth: 0,
  },
  status: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
  },
  dangerStatus: {
    color: colors.foregroundDanger,
  },
  submit: {
    borderRadius: radii.full,
    paddingInline: 0,
    width: tokens.controlHeight,
  },
  spinning: {
    animationDuration: "0.8s",
    animationIterationCount: "infinite",
    animationName: spin,
    animationTimingFunction: "linear",
  },
});
