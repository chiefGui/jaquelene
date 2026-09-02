import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  MarkdownEditorAccessibleName,
  MarkdownEditorCommand,
  MarkdownEditorHandle,
} from "./markdown-editor-input";

export type MarkdownEditorMode = "edit" | "preview";

type MarkdownEditorValueOwnership =
  | {
      defaultValue?: never;
      onValueChange: (value: string) => void;
      value: string;
    }
  | {
      defaultValue?: string;
      onValueChange?: (value: string) => void;
      value?: never;
    };

type MarkdownEditorModeOwnership =
  | {
      defaultMode?: never;
      mode: MarkdownEditorMode;
      onModeChange: (mode: MarkdownEditorMode) => void;
    }
  | {
      defaultMode?: MarkdownEditorMode;
      mode?: never;
      onModeChange?: (mode: MarkdownEditorMode) => void;
    };

export type MarkdownEditorRootProps = MarkdownEditorAccessibleName &
  MarkdownEditorValueOwnership &
  MarkdownEditorModeOwnership & {
    "aria-describedby"?: string;
    autoFocus?: boolean;
    children: ReactNode;
    disabled?: boolean;
    invalid?: boolean;
    onBlur?: () => void;
    onFocus?: () => void;
    placeholder?: string;
    readOnly?: boolean;
  };

export type MarkdownEditorConfiguration = Readonly<{
  ariaDescribedBy: string | undefined;
  ariaLabel: string | undefined;
  ariaLabelledBy: string | undefined;
  autoFocus: boolean;
  disabled: boolean;
  inputRef: RefObject<MarkdownEditorHandle | null>;
  invalid: boolean;
  mode: MarkdownEditorMode;
  onBlur: (() => void) | undefined;
  onFocus: (() => void) | undefined;
  placeholder: string;
  readOnly: boolean;
  setMode: (mode: MarkdownEditorMode) => void;
}>;

export type MarkdownEditorDocument = Readonly<{
  setValue: (value: string) => void;
  value: string;
}>;

const MarkdownEditorConfigurationContext = createContext<MarkdownEditorConfiguration | null>(null);
const MarkdownEditorDocumentContext = createContext<MarkdownEditorDocument | null>(null);

function useControllableState<Value>({
  controlledValue,
  defaultValue,
  onChange,
}: {
  controlledValue: Value | undefined;
  defaultValue: Value;
  onChange: ((value: Value) => void) | undefined;
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const controlled = controlledValue !== undefined;
  const value = controlledValue ?? uncontrolledValue;
  const setValue = useCallback(
    (nextValue: Value) => {
      if (!controlled) {
        setUncontrolledValue(nextValue);
      }

      onChange?.(nextValue);
    },
    [controlled, onChange],
  );

  return [value, setValue] as const;
}

export function useMarkdownEditorConfiguration(component: string) {
  const configuration = useContext(MarkdownEditorConfigurationContext);

  if (!configuration) {
    throw new Error(`MarkdownEditor.${component} must be rendered inside MarkdownEditor.Root.`);
  }

  return configuration;
}

export function useMarkdownEditorDocument(component: string) {
  const document = useContext(MarkdownEditorDocumentContext);

  if (!document) {
    throw new Error(`MarkdownEditor.${component} must be rendered inside MarkdownEditor.Root.`);
  }

  return document;
}

export function createMarkdownEditorHandle(
  inputRef: RefObject<MarkdownEditorHandle | null>,
): MarkdownEditorHandle {
  return {
    focus() {
      inputRef.current?.focus();
    },
    run(command) {
      return inputRef.current?.run(command) ?? false;
    },
  };
}

export const MarkdownEditorRoot = forwardRef<MarkdownEditorHandle, MarkdownEditorRootProps>(
  function MarkdownEditorRoot(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      autoFocus = false,
      children,
      defaultMode = "edit",
      defaultValue = "",
      disabled = false,
      invalid = false,
      mode: controlledMode,
      onBlur,
      onFocus,
      onModeChange,
      onValueChange,
      placeholder = "Write Markdown…",
      readOnly = false,
      value: controlledValue,
    },
    ref,
  ) {
    const inputRef = useRef<MarkdownEditorHandle>(null);
    const [mode, setMode] = useControllableState({
      controlledValue: controlledMode,
      defaultValue: defaultMode,
      onChange: onModeChange,
    });
    const [value, setValue] = useControllableState({
      controlledValue,
      defaultValue,
      onChange: onValueChange,
    });

    useImperativeHandle(ref, () => createMarkdownEditorHandle(inputRef), []);

    const configuration = useMemo<MarkdownEditorConfiguration>(
      () => ({
        ariaDescribedBy,
        ariaLabel,
        ariaLabelledBy,
        autoFocus,
        disabled,
        inputRef,
        invalid,
        mode,
        onBlur,
        onFocus,
        placeholder,
        readOnly,
        setMode,
      }),
      [
        ariaDescribedBy,
        ariaLabel,
        ariaLabelledBy,
        autoFocus,
        disabled,
        invalid,
        mode,
        onBlur,
        onFocus,
        placeholder,
        readOnly,
        setMode,
      ],
    );
    const document = useMemo<MarkdownEditorDocument>(
      () => ({ setValue, value }),
      [setValue, value],
    );

    return (
      <MarkdownEditorConfigurationContext.Provider value={configuration}>
        <MarkdownEditorDocumentContext.Provider value={document}>
          {children}
        </MarkdownEditorDocumentContext.Provider>
      </MarkdownEditorConfigurationContext.Provider>
    );
  },
);

export type MarkdownEditorState = Readonly<{
  disabled: boolean;
  focus: () => void;
  mode: MarkdownEditorMode;
  readOnly: boolean;
  run: (command: MarkdownEditorCommand) => boolean;
  setMode: (mode: MarkdownEditorMode) => void;
  setValue: (value: string) => void;
  value: string;
}>;

export function useMarkdownEditor(): MarkdownEditorState {
  const configuration = useMarkdownEditorConfiguration("consumer");
  const document = useMarkdownEditorDocument("consumer");

  return useMemo(
    () => ({
      disabled: configuration.disabled,
      focus: () => configuration.inputRef.current?.focus(),
      mode: configuration.mode,
      readOnly: configuration.readOnly,
      run: (command: MarkdownEditorCommand) =>
        configuration.inputRef.current?.run(command) ?? false,
      setMode: configuration.setMode,
      setValue: document.setValue,
      value: document.value,
    }),
    [configuration, document],
  );
}
