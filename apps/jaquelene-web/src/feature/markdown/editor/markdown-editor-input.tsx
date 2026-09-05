import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdownKeymap } from "@codemirror/lang-markdown";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  keymap,
  placeholder as editorPlaceholder,
  type KeyBinding,
} from "@codemirror/view";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type AriaAttributes,
  type FocusEventHandler,
} from "react";
import {
  markdownEditorCommands,
  type MarkdownEditorCommand as EditorCommand,
} from "./markdown-editor-command";
import { markdownEditorLanguage } from "./markdown-editor-language";
import { externalDocument, synchronizeMarkdownDocument } from "./markdown-editor-document";
import { markdownEditorTheme } from "./markdown-editor-theme";

export type MarkdownEditorCommand = EditorCommand;
export type MarkdownEditorInitialSelection = "start" | "end";

export type MarkdownEditorAccessibleNameProps = Pick<
  AriaAttributes,
  "aria-label" | "aria-labelledby"
>;

export type MarkdownEditorInputProps = MarkdownEditorAccessibleNameProps & {
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  autoFocus?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  historyKey?: number;
  id?: string;
  initialSelection?: MarkdownEditorInitialSelection;
  maxLength?: number;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onChange: (value: string) => void;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  placeholder?: string;
  readOnly?: boolean;
  style?: StyleXStyles;
  value: string;
};

type EditorRuntime = Readonly<{
  configuration: Compartment;
  history: Compartment;
  view: EditorView;
}>;

type DynamicOptions = Readonly<{
  ariaDescribedBy: string | undefined;
  ariaInvalid: AriaAttributes["aria-invalid"];
  ariaLabel: string | undefined;
  ariaLabelledBy: string | undefined;
  disabled: boolean;
  id: string | undefined;
  maxLength: number | undefined;
  placeholder: string;
  readOnly: boolean;
}>;

// Keep public refs DOM-native for form libraries while retaining command access internally.
const editorViews = new WeakMap<HTMLElement, EditorView>();

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
    autocorrect: "off",
    role: "textbox",
    spellcheck: "false",
    tabindex: options.disabled ? "-1" : "0",
  };

  if (options.ariaDescribedBy) {
    attributes["aria-describedby"] = options.ariaDescribedBy;
  }

  if (options.ariaInvalid !== undefined && options.ariaInvalid !== false) {
    attributes["aria-invalid"] = String(options.ariaInvalid);
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

  if (options.id) {
    attributes.id = options.id;
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

function allowsDocumentChange(
  startLength: number,
  nextLength: number,
  maxLength: number | undefined,
) {
  // An oversized external value must remain editable toward validity.
  return maxLength === undefined || nextLength <= maxLength || nextLength < startLength;
}

export function runMarkdownEditorCommand(
  element: HTMLElement | null | undefined,
  command: EditorCommand,
) {
  const view = element ? editorViews.get(element) : undefined;

  if (!view) {
    return false;
  }

  const handled = markdownEditorCommands[command]({ state: view.state, dispatch: view.dispatch });

  if (handled) {
    view.focus();
  }

  return handled;
}

export const MarkdownEditorInput = forwardRef<HTMLElement, MarkdownEditorInputProps>(
  function MarkdownEditorInput(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      autoFocus = false,
      disabled = false,
      hidden = false,
      historyKey = 0,
      id,
      initialSelection = "start",
      maxLength,
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
    const initialSelectionRef = useRef(initialSelection);
    const documentValueRef = useRef(value);
    const historyKeyRef = useRef(historyKey);
    const autoFocusRef = useRef(autoFocus && !hidden);
    const onChangeRef = useRef(onChange);
    const dynamicOptionsRef = useRef<DynamicOptions>({
      ariaDescribedBy,
      ariaInvalid,
      ariaLabel,
      ariaLabelledBy,
      disabled,
      id,
      maxLength,
      placeholder,
      readOnly,
    });

    if (maxLength !== undefined && (!Number.isSafeInteger(maxLength) || maxLength < 0)) {
      throw new RangeError("Markdown editor maximum length must be a nonnegative safe integer.");
    }

    onChangeRef.current = onChange;
    dynamicOptionsRef.current = {
      ariaDescribedBy,
      ariaInvalid,
      ariaLabel,
      ariaLabelledBy,
      disabled,
      id,
      maxLength,
      placeholder,
      readOnly,
    };

    useLayoutEffect(() => {
      const host = hostRef.current;

      if (!host) {
        return;
      }

      const configuration = new Compartment();
      const historyCompartment = new Compartment();
      const options = dynamicOptionsRef.current;
      const initialDocument = initialValueRef.current;
      let initialSelectionAnchor = 0;

      if (initialSelectionRef.current === "end") {
        initialSelectionAnchor = initialDocument.length;
      }

      const view = new EditorView({
        doc: initialDocument,
        selection: { anchor: initialSelectionAnchor },
        parent: host,
        extensions: [
          configuration.of(dynamicExtensions(options)),
          EditorState.tabSize.of(2),
          EditorState.changeFilter.of((transaction) => {
            if (
              !transaction.docChanged ||
              transaction.annotation(externalDocument) === true ||
              allowsDocumentChange(
                transaction.startState.doc.length,
                transaction.newDoc.length,
                dynamicOptionsRef.current.maxLength,
              )
            ) {
              return true;
            }

            return false;
          }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            const synchronizedExternally = update.transactions.some(
              (transaction) => transaction.annotation(externalDocument) === true,
            );

            if (update.docChanged && !synchronizedExternally) {
              const nextValue = update.state.doc.toString();
              documentValueRef.current = nextValue;
              onChangeRef.current(nextValue);
            }
          }),
          highlightSpecialChars(),
          historyCompartment.of(history()),
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

      runtimeRef.current = { configuration, history: historyCompartment, view };
      editorViews.set(view.contentDOM, view);

      if (autoFocusRef.current) {
        view.focus();
      }

      return () => {
        runtimeRef.current = null;
        editorViews.delete(view.contentDOM);
        view.destroy();
      };
    }, []);

    useImperativeHandle(ref, () => runtimeRef.current!.view.contentDOM, []);

    useLayoutEffect(() => {
      const runtime = runtimeRef.current;

      if (!runtime) {
        return;
      }

      runtime.view.dispatch({
        effects: runtime.configuration.reconfigure(dynamicExtensions(dynamicOptionsRef.current)),
      });
    }, [
      ariaDescribedBy,
      ariaInvalid,
      ariaLabel,
      ariaLabelledBy,
      disabled,
      id,
      placeholder,
      readOnly,
    ]);

    useLayoutEffect(() => {
      const runtime = runtimeRef.current;
      const resetHistory = historyKeyRef.current !== historyKey;

      if (!runtime || (documentValueRef.current === value && !resetHistory)) {
        return;
      }

      documentValueRef.current = value;
      historyKeyRef.current = historyKey;
      runtime.view.update(
        synchronizeMarkdownDocument(runtime.view.state, value, runtime.history, resetHistory),
      );
    }, [historyKey, value]);

    useLayoutEffect(() => {
      if (!hidden) {
        runtimeRef.current?.view.requestMeasure();
      }
    }, [hidden]);

    return (
      <div
        ref={hostRef}
        hidden={hidden}
        onBlur={onBlur}
        onFocus={onFocus}
        {...stylex.props(styles.root, style)}
      />
    );
  },
);

const styles = stylex.create({
  root: {
    minWidth: 0,
  },
});
