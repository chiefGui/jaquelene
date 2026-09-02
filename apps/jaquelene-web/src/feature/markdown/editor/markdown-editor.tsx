import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdownKeymap } from "@codemirror/lang-markdown";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  keymap,
  placeholder as editorPlaceholder,
  type KeyBinding,
} from "@codemirror/view";
import CodeIcon from "@hugeicons/core-free-icons/CodeIcon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import TextBoldIcon from "@hugeicons/core-free-icons/TextBoldIcon";
import TextItalicIcon from "@hugeicons/core-free-icons/TextItalicIcon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { formatCount, IconButton } from "@jaquelene/ui";
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import {
  forwardRef,
  useDeferredValue,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  markdownEditorCommands,
  type MarkdownEditorCommand as EditorCommand,
} from "./markdown-editor-command";
import { markdownEditorLanguage } from "./markdown-editor-language";
import { countMarkdownDocument } from "./markdown-editor-statistics";
import { markdownEditorTheme } from "./markdown-editor-theme";

export type MarkdownEditorCommand = EditorCommand;

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

export type MarkdownEditorProps = AccessibleName & {
  "aria-describedby"?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  style?: StyleXStyles;
  value: string;
};

export type MarkdownEditorHandle = Readonly<{
  focus: () => void;
  run: (command: EditorCommand) => boolean;
}>;

type EditorRuntime = Readonly<{
  configuration: Compartment;
  view: EditorView;
}>;

type DynamicOptions = Readonly<{
  ariaDescribedBy: string | undefined;
  ariaLabel: string | undefined;
  ariaLabelledBy: string | undefined;
  disabled: boolean;
  invalid: boolean;
  onBlur: (() => void) | undefined;
  onFocus: (() => void) | undefined;
  placeholder: string;
  readOnly: boolean;
}>;

const externalValue = Annotation.define<boolean>();

const formattingKeymap: readonly KeyBinding[] = [
  { key: "Mod-b", preventDefault: true, run: markdownEditorCommands.strong },
  { key: "Mod-i", preventDefault: true, run: markdownEditorCommands.emphasis },
  { key: "Mod-e", preventDefault: true, run: markdownEditorCommands.code },
  { key: "Mod-k", preventDefault: true, run: markdownEditorCommands.link },
];

const formattingActions: readonly Readonly<{
  command: EditorCommand;
  icon: IconSvgElement;
  label: string;
}>[] = [
  { command: "strong", icon: TextBoldIcon, label: "Bold" },
  { command: "emphasis", icon: TextItalicIcon, label: "Italic" },
  { command: "code", icon: CodeIcon, label: "Inline code" },
  { command: "link", icon: Link01Icon, label: "Link" },
];

function contentAttributes(options: DynamicOptions) {
  const attributes: Record<string, string> = {
    "aria-multiline": "true",
    autocapitalize: "sentences",
    autocorrect: "on",
    role: "textbox",
    spellcheck: "true",
    tabindex: options.disabled ? "-1" : "0",
  };

  if (options.ariaDescribedBy) {
    attributes["aria-describedby"] = options.ariaDescribedBy;
  }

  if (options.ariaLabel) {
    attributes["aria-label"] = options.ariaLabel;
  }

  if (options.ariaLabelledBy) {
    attributes["aria-labelledby"] = options.ariaLabelledBy;
  }

  if (options.disabled) {
    attributes["aria-disabled"] = "true";
  }

  if (options.invalid) {
    attributes["aria-invalid"] = "true";
  }

  if (options.readOnly) {
    attributes["aria-readonly"] = "true";
  }

  return attributes;
}

function dynamicExtensions(options: DynamicOptions) {
  return [
    EditorView.contentAttributes.of(contentAttributes(options)),
    EditorState.readOnly.of(options.disabled || options.readOnly),
    EditorView.editable.of(!options.disabled && !options.readOnly),
    editorPlaceholder(options.placeholder),
  ];
}

function formatUnit(value: number, singular: string) {
  return `${formatCount(value)} ${singular}${value === 1 ? "" : "s"}`;
}

function runEditorCommand(view: EditorView | undefined, command: EditorCommand) {
  if (!view) {
    return false;
  }

  const handled = markdownEditorCommands[command]({ state: view.state, dispatch: view.dispatch });

  if (handled) {
    view.focus();
  }

  return handled;
}

type FormattingActionProps = Readonly<{
  command: EditorCommand;
  disabled: boolean;
  icon: IconSvgElement;
  label: string;
  onRun: (command: EditorCommand) => void;
}>;

function FormattingAction({ command, disabled, icon, label, onRun }: FormattingActionProps) {
  return (
    <IconButton
      type="button"
      size="small"
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onRun(command)}
    >
      <HugeiconsIcon icon={icon} size={15} strokeWidth={1.5} aria-hidden="true" />
    </IconButton>
  );
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      autoFocus = false,
      disabled = false,
      invalid = false,
      onBlur,
      onChange,
      onFocus,
      placeholder = "Write Markdown…",
      readOnly = false,
      style,
      value,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const runtimeRef = useRef<EditorRuntime | null>(null);
    const initialValueRef = useRef(value);
    const autoFocusRef = useRef(autoFocus);
    const onChangeRef = useRef(onChange);
    const deferredValue = useDeferredValue(value);
    const statistics = useMemo(() => countMarkdownDocument(deferredValue), [deferredValue]);
    const dynamicOptionsRef = useRef<DynamicOptions>({
      ariaDescribedBy,
      ariaLabel,
      ariaLabelledBy,
      disabled,
      invalid,
      onBlur,
      onFocus,
      placeholder,
      readOnly,
    });

    onChangeRef.current = onChange;
    dynamicOptionsRef.current = {
      ariaDescribedBy,
      ariaLabel,
      ariaLabelledBy,
      disabled,
      invalid,
      onBlur,
      onFocus,
      placeholder,
      readOnly,
    };

    useImperativeHandle(
      ref,
      () => ({
        focus() {
          runtimeRef.current?.view.focus();
        },
        run(command) {
          return runEditorCommand(runtimeRef.current?.view, command);
        },
      }),
      [],
    );

    useLayoutEffect(() => {
      const host = hostRef.current;

      if (!host) {
        return;
      }

      const configuration = new Compartment();
      const options = dynamicOptionsRef.current;
      const view = new EditorView({
        doc: initialValueRef.current,
        parent: host,
        extensions: [
          configuration.of(dynamicExtensions(options)),
          EditorState.tabSize.of(2),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            const synchronizedExternally = update.transactions.some(
              (transaction) => transaction.annotation(externalValue) === true,
            );

            if (update.docChanged && !synchronizedExternally) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            blur: () => {
              dynamicOptionsRef.current.onBlur?.();
            },
            focus: () => {
              dynamicOptionsRef.current.onFocus?.();
            },
          }),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          highlightSelectionMatches(),
          keymap.of([
            ...formattingKeymap,
            ...markdownKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...defaultKeymap,
          ]),
          markdownEditorLanguage,
          markdownEditorTheme,
        ],
      });

      runtimeRef.current = { configuration, view };

      if (autoFocusRef.current) {
        view.focus();
      }

      return () => {
        runtimeRef.current = null;
        view.destroy();
      };
    }, []);

    useLayoutEffect(() => {
      const runtime = runtimeRef.current;

      if (!runtime) {
        return;
      }

      const options = dynamicOptionsRef.current;
      runtime.view.dispatch({
        effects: runtime.configuration.reconfigure(dynamicExtensions(options)),
      });
    }, [ariaDescribedBy, ariaLabel, ariaLabelledBy, disabled, invalid, placeholder, readOnly]);

    useLayoutEffect(() => {
      const view = runtimeRef.current?.view;

      if (!view || view.state.doc.toString() === value) {
        return;
      }

      view.dispatch({
        annotations: [externalValue.of(true), Transaction.addToHistory.of(false)],
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }, [value]);

    function runFormattingAction(command: EditorCommand) {
      runEditorCommand(runtimeRef.current?.view, command);
    }

    return (
      <div
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        data-readonly={readOnly || undefined}
        {...stylex.props(styles.root, style)}
      >
        <div role="group" aria-label="Markdown formatting" {...stylex.props(styles.toolbar)}>
          {formattingActions.map((action) => (
            <FormattingAction
              key={action.command}
              {...action}
              disabled={disabled || readOnly}
              onRun={runFormattingAction}
            />
          ))}
        </div>
        <div ref={hostRef} {...stylex.props(styles.host)} />
        <div role="group" aria-label="Document statistics" {...stylex.props(styles.status)}>
          <span>{formatUnit(statistics.lines, "line")}</span>
          <span aria-hidden="true">·</span>
          <span>{formatUnit(statistics.words, "word")}</span>
          <span aria-hidden="true">·</span>
          <span>{formatUnit(statistics.characters, "character")}</span>
        </div>
      </div>
    );
  },
);

const styles = stylex.create({
  root: {
    backgroundColor: colors.backgroundNeutralSubtlest,
    borderColor: {
      default: colors.borderDefault,
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
    fontSize: tokens.fontSizeBase,
    lineHeight: tokens.lineHeightLarge,
    minHeight: "24rem",
    opacity: {
      default: 1,
      ':is([data-disabled="true"])': 0.5,
    },
    overflow: "hidden",
    width: "100%",
  },
  host: {
    flexGrow: 1,
    minHeight: "20rem",
    minWidth: 0,
  },
  toolbar: {
    alignItems: "center",
    borderBottomColor: colors.borderSubtle,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexShrink: 0,
    gap: "0.125rem",
    paddingBlock: "0.25rem",
    paddingInline: "0.375rem",
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
    gap: "0.375rem",
    justifyContent: "flex-end",
    lineHeight: tokens.lineHeightXSmall,
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
});
