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
import { colors, radii, tokens } from "@jaquelene/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { markdownEditorCommands, type MarkdownEditorCommand } from "./markdown-editor-command";
import { markdownEditorLanguage } from "./markdown-editor-language";
import { markdownEditorTheme } from "./markdown-editor-theme";

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
  run: (command: MarkdownEditorCommand) => boolean;
}>;

type EditorRuntime = Readonly<{
  attributes: Compartment;
  editability: Compartment;
  placeholder: Compartment;
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
          const view = runtimeRef.current?.view;

          if (!view) {
            return false;
          }

          const handled = markdownEditorCommands[command]({
            state: view.state,
            dispatch: view.dispatch,
          });

          if (handled) {
            view.focus();
          }

          return handled;
        },
      }),
      [],
    );

    useLayoutEffect(() => {
      const host = hostRef.current;

      if (!host) {
        return;
      }

      const attributes = new Compartment();
      const editability = new Compartment();
      const placeholder = new Compartment();
      const options = dynamicOptionsRef.current;
      const view = new EditorView({
        doc: initialValueRef.current,
        parent: host,
        extensions: [
          attributes.of(EditorView.contentAttributes.of(contentAttributes(options))),
          editability.of([
            EditorState.readOnly.of(options.disabled || options.readOnly),
            EditorView.editable.of(!options.disabled && !options.readOnly),
          ]),
          placeholder.of(editorPlaceholder(options.placeholder)),
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

      runtimeRef.current = { attributes, editability, placeholder, view };

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
        effects: [
          runtime.attributes.reconfigure(
            EditorView.contentAttributes.of(contentAttributes(options)),
          ),
          runtime.editability.reconfigure([
            EditorState.readOnly.of(options.disabled || options.readOnly),
            EditorView.editable.of(!options.disabled && !options.readOnly),
          ]),
          runtime.placeholder.reconfigure(editorPlaceholder(options.placeholder)),
        ],
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

    return (
      <div
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        data-readonly={readOnly || undefined}
        {...stylex.props(styles.root, style)}
      >
        <div ref={hostRef} {...stylex.props(styles.host)} />
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
    height: "100%",
    minHeight: "inherit",
  },
});
