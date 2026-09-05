import CodeIcon from "@hugeicons/core-free-icons/CodeIcon";
import EyeIcon from "@hugeicons/core-free-icons/EyeIcon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { formatPluralizedCount, IconButton, Skeleton, type IconButtonProps } from "@jaquelene/ui";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import {
  forwardRef,
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useMemo,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react";
import { BoldIcon, EditIcon, ItalicIcon } from "@/primitive/icons";
import {
  MarkdownEditorInput,
  runMarkdownEditorCommand,
  type MarkdownEditorAccessibleNameProps,
  type MarkdownEditorCommand,
} from "./markdown-editor-input";
import {
  MarkdownEditorRoot,
  useMarkdownEditorConfiguration,
  useMarkdownEditorDocument,
  type MarkdownEditorConfiguration,
  type MarkdownEditorRootProps,
} from "./markdown-editor-root";
import { countMarkdownDocument } from "./markdown-editor-statistics";

export {
  MarkdownEditorInput,
  type MarkdownEditorCommand,
  type MarkdownEditorInitialSelection,
  type MarkdownEditorInputProps,
} from "./markdown-editor-input";
export {
  type MarkdownEditorMode,
  type MarkdownEditorRootProps,
  type MarkdownEditorState,
  useMarkdownEditor,
} from "./markdown-editor-root";

type WithoutChildren<Props> = Props extends unknown ? Omit<Props, "children"> : never;

export type MarkdownEditorProps = WithoutChildren<MarkdownEditorRootProps> & {
  toolbarActions?: ReactNode;
  statusContent?: ReactNode;
  style?: StyleXStyles;
};

const MarkdownPreview = lazy(async () => {
  const { Markdown } = await import("../markdown");
  return { default: Markdown };
});

const formattingActions = {
  code: { icon: CodeIcon, label: "Inline code" },
  emphasis: { icon: ItalicIcon, label: "Italic" },
  link: { icon: Link01Icon, label: "Link" },
  strong: { icon: BoldIcon, label: "Bold" },
} satisfies Record<MarkdownEditorCommand, Readonly<{ icon: IconSvgElement; label: string }>>;

const defaultFormattingCommands: readonly MarkdownEditorCommand[] = ["strong", "emphasis"];

function getAccessibleNameProps(
  configuration: MarkdownEditorConfiguration,
): MarkdownEditorAccessibleNameProps {
  if (configuration.ariaLabel !== undefined) {
    return { "aria-label": configuration.ariaLabel };
  }

  if (configuration.ariaLabelledBy !== undefined) {
    return { "aria-labelledby": configuration.ariaLabelledBy };
  }

  // Form libraries may add the label relationship after their field items
  // register. The editor accepts that transient state and applies the name as
  // soon as the composed control receives it.
  return {};
}

type StyleableDivProps = Omit<ComponentProps<"div">, "className" | "style"> & {
  style?: StyleXStyles;
};

function MarkdownEditorFrame({ style, ...props }: StyleableDivProps) {
  const { disabled, invalid, readOnly } = useMarkdownEditorConfiguration("Frame");

  return (
    <div
      {...props}
      data-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
      data-readonly={readOnly || undefined}
      {...stylex.props(styles.frame, style, stylex.defaultMarker())}
    />
  );
}

function MarkdownEditorToolbar({ "aria-label": ariaLabel, style, ...props }: StyleableDivProps) {
  return (
    <div
      {...props}
      role="group"
      aria-label={ariaLabel ?? "Markdown editor controls"}
      {...stylex.props(styles.toolbar, style, stylex.defaultMarker())}
    />
  );
}

type MarkdownEditorActionProps = Omit<
  IconButtonProps,
  "aria-label" | "children" | "shape" | "size" | "type"
> & {
  icon: IconSvgElement;
  label: string;
};

function MarkdownEditorAction({ icon, label, ...props }: MarkdownEditorActionProps) {
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

type MarkdownEditorFormatActionProps = Omit<
  MarkdownEditorActionProps,
  "disabled" | "icon" | "label" | "onClick" | "onMouseDown"
> & {
  command: MarkdownEditorCommand;
  icon?: IconSvgElement;
  label?: string;
};

function MarkdownEditorFormatAction({
  command,
  icon,
  label,
  ...props
}: MarkdownEditorFormatActionProps) {
  const { disabled, inputRef, mode, readOnly } = useMarkdownEditorConfiguration("FormatAction");
  const action = formattingActions[command];

  return (
    <MarkdownEditorAction
      {...props}
      label={label ?? action.label}
      icon={icon ?? action.icon}
      disabled={disabled || readOnly || mode === "preview"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => runMarkdownEditorCommand(inputRef.current, command)}
    />
  );
}

function MarkdownEditorFormattingActions({
  commands = defaultFormattingCommands,
}: {
  commands?: readonly MarkdownEditorCommand[];
}) {
  return commands.map((command) => <MarkdownEditorFormatAction key={command} command={command} />);
}

type MarkdownEditorPreviewToggleProps = Omit<
  MarkdownEditorActionProps,
  "aria-pressed" | "disabled" | "icon" | "label" | "onClick"
>;

function MarkdownEditorPreviewToggle({ style, ...props }: MarkdownEditorPreviewToggleProps) {
  const { disabled, mode, setMode } = useMarkdownEditorConfiguration("PreviewToggle");
  let icon = EyeIcon;
  let label = "Preview";
  let nextMode: "edit" | "preview" = "preview";

  if (mode === "preview") {
    icon = EditIcon;
    label = "Edit";
    nextMode = "edit";
  }

  return (
    <MarkdownEditorAction
      {...props}
      style={style}
      label={label}
      icon={icon}
      disabled={disabled}
      onClick={() => setMode(nextMode)}
    />
  );
}

type MarkdownEditorInputPartProps = Readonly<{
  hidden?: boolean;
  style?: StyleXStyles;
}>;

function setRef<Value>(ref: Ref<Value> | undefined, value: Value | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

const MarkdownEditorInputPart = forwardRef<HTMLElement, MarkdownEditorInputPartProps>(
  function MarkdownEditorInputPart({ hidden = false, style }, ref) {
    const configuration = useMarkdownEditorConfiguration("Input");
    const document = useMarkdownEditorDocument("Input");
    const accessibleName = getAccessibleNameProps(configuration);
    const setInputRef = useCallback(
      (element: HTMLElement | null) => {
        configuration.inputRef.current = element;
        setRef(configuration.controlRef, element);
        setRef(ref, element);
      },
      [configuration.controlRef, configuration.inputRef, ref],
    );

    return (
      <MarkdownEditorInput
        ref={setInputRef}
        {...accessibleName}
        {...(configuration.ariaDescribedBy === undefined
          ? {}
          : { "aria-describedby": configuration.ariaDescribedBy })}
        {...(configuration.ariaInvalid === undefined
          ? {}
          : { "aria-invalid": configuration.ariaInvalid })}
        autoFocus={configuration.autoFocus && !hidden}
        disabled={configuration.disabled}
        hidden={hidden}
        {...(configuration.id === undefined ? {} : { id: configuration.id })}
        initialSelection={configuration.initialSelection}
        {...(configuration.maxLength === undefined ? {} : { maxLength: configuration.maxLength })}
        {...(configuration.onBlur === undefined ? {} : { onBlur: configuration.onBlur })}
        onChange={document.setValue}
        {...(configuration.onFocus === undefined ? {} : { onFocus: configuration.onFocus })}
        placeholder={configuration.placeholder}
        readOnly={configuration.readOnly}
        {...(style === undefined ? {} : { style })}
        value={document.value}
      />
    );
  },
);

type MarkdownEditorPreviewProps = StyleableDivProps & {
  fallback?: ReactNode;
};

function MarkdownPreviewSkeleton() {
  return (
    <div role="status" aria-label="Loading preview" {...stylex.props(styles.previewSkeleton)}>
      <Skeleton style={[styles.skeletonLine, styles.skeletonHeading]} />
      <Skeleton style={styles.skeletonLine} />
      <Skeleton style={[styles.skeletonLine, styles.skeletonMedium]} />
      <Skeleton style={[styles.skeletonLine, styles.skeletonShort]} />
    </div>
  );
}

function MarkdownEditorPreview({
  "aria-label": ariaLabel,
  fallback = <MarkdownPreviewSkeleton />,
  style,
  ...props
}: MarkdownEditorPreviewProps) {
  const { value } = useMarkdownEditorDocument("Preview");
  const deferredValue = useDeferredValue(value);

  return (
    <div
      {...props}
      role="region"
      aria-label={ariaLabel ?? "Markdown preview"}
      {...stylex.props(styles.preview, style, stylex.defaultMarker())}
    >
      <Suspense fallback={fallback}>
        <MarkdownPreview content={deferredValue} />
      </Suspense>
    </div>
  );
}

function MarkdownEditorContent() {
  const { mode } = useMarkdownEditorConfiguration("Content");

  return (
    <>
      <MarkdownEditorInputPart hidden={mode === "preview"} />
      {mode === "preview" ? <MarkdownEditorPreview /> : null}
    </>
  );
}

function MarkdownEditorStatus({ "aria-label": ariaLabel, style, ...props }: StyleableDivProps) {
  return (
    <div
      {...props}
      role="group"
      aria-label={ariaLabel ?? "Document statistics"}
      {...stylex.props(styles.status, style, stylex.defaultMarker())}
    />
  );
}

type MarkdownEditorStatisticsProps = Omit<ComponentProps<"span">, "className" | "style"> & {
  style?: StyleXStyles;
};

function MarkdownEditorStatistics({ style, ...props }: MarkdownEditorStatisticsProps) {
  const { value } = useMarkdownEditorDocument("Statistics");
  const deferredValue = useDeferredValue(value);
  const statistics = useMemo(() => countMarkdownDocument(deferredValue), [deferredValue]);

  return (
    <span {...props} {...stylex.props(styles.statistics, style, stylex.defaultMarker())}>
      <span>{formatPluralizedCount(statistics.lines, "line", "lines")}</span>
      <span aria-hidden="true">·</span>
      <span>{formatPluralizedCount(statistics.words, "word", "words")}</span>
      <span aria-hidden="true">·</span>
      <span>{formatPluralizedCount(statistics.characters, "character", "characters")}</span>
      <span aria-hidden="true">·</span>
      <span>≈ {formatPluralizedCount(statistics.estimatedTokens, "token", "tokens")}</span>
    </span>
  );
}

const MarkdownEditorDefaultContent = memo(function MarkdownEditorDefaultContent({
  style,
  toolbarActions,
  statusContent,
}: {
  style: StyleXStyles | undefined;
  toolbarActions: ReactNode;
  statusContent: ReactNode;
}) {
  return (
    <MarkdownEditorFrame style={style}>
      <MarkdownEditorToolbar>
        <MarkdownEditorFormattingActions />
        {toolbarActions}
        <MarkdownEditorPreviewToggle style={styles.previewTogglePlacement} />
      </MarkdownEditorToolbar>
      <MarkdownEditorContent />
      <MarkdownEditorStatus>
        {statusContent}
        <MarkdownEditorStatistics />
      </MarkdownEditorStatus>
    </MarkdownEditorFrame>
  );
});

const MarkdownEditorDefault = forwardRef<HTMLElement, MarkdownEditorProps>(
  function MarkdownEditorDefault({ style, toolbarActions, statusContent, ...props }, ref) {
    return (
      <MarkdownEditorRoot {...props} ref={ref}>
        <MarkdownEditorDefaultContent
          style={style}
          toolbarActions={toolbarActions}
          statusContent={statusContent}
        />
      </MarkdownEditorRoot>
    );
  },
);

export const MarkdownEditor = Object.assign(MarkdownEditorDefault, {
  Root: MarkdownEditorRoot,
  Frame: MarkdownEditorFrame,
  Toolbar: MarkdownEditorToolbar,
  Action: MarkdownEditorAction,
  FormatAction: MarkdownEditorFormatAction,
  FormattingActions: MarkdownEditorFormattingActions,
  PreviewToggle: MarkdownEditorPreviewToggle,
  Content: MarkdownEditorContent,
  Input: MarkdownEditorInputPart,
  Preview: MarkdownEditorPreview,
  Status: MarkdownEditorStatus,
  Statistics: MarkdownEditorStatistics,
});

const styles = stylex.create({
  frame: {
    backgroundColor: colors.backgroundNeutralSubtlest,
    borderColor: {
      default: colors.borderSubtle,
      ":focus-within": colors.borderFocus,
      ':is([data-invalid="true"])': colors.borderDanger,
      ':is([data-invalid="true"]):focus-within': colors.borderDangerFocus,
    },
    borderRadius: radii.control,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.foregroundPrimary,
    display: "flex",
    flexDirection: "column",
    fontFamily: "inherit",
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    opacity: {
      default: 1,
      ':is([data-disabled="true"])': 0.5,
    },
    overflow: "hidden",
    width: "100%",
  },
  toolbar: {
    alignItems: "center",
    borderBottomColor: colors.borderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexShrink: 0,
    gap: "0.125rem",
    padding: "0.25rem",
  },
  previewTogglePlacement: {
    marginLeft: "auto",
  },
  preview: {
    flexGrow: 1,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    maxHeight: "24rem",
    minHeight: "8rem",
    overflow: "auto",
    padding: "1rem",
  },
  status: {
    alignItems: "center",
    borderTopColor: colors.borderSubtle,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: colors.foregroundSecondary,
    display: "flex",
    flexShrink: 0,
    fontSize: tokens.fontSizeXSmall,
    justifyContent: "flex-end",
    lineHeight: tokens.lineHeightXSmall,
    minHeight: "2rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  statistics: {
    alignItems: "center",
    color: colors.foregroundDisabled,
    display: "inline-flex",
    fontSize: tokens.fontSizeXXSmall,
    gap: "0.375rem",
    lineHeight: tokens.lineHeightXXSmall,
  },
  previewSkeleton: {
    display: "flex",
    flexDirection: "column",
    gap: "0.625rem",
    maxWidth: "42rem",
  },
  skeletonLine: {
    height: "0.625rem",
    width: "100%",
  },
  skeletonHeading: {
    height: "1rem",
    marginBottom: "0.375rem",
    width: "42%",
  },
  skeletonMedium: {
    width: "84%",
  },
  skeletonShort: {
    width: "62%",
  },
});
