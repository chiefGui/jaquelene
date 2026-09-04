import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AriaAttributes,
  type FocusEventHandler,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  runMarkdownEditorCommand,
  type MarkdownEditorAccessibleNameProps,
  type MarkdownEditorCommand,
  type MarkdownEditorInitialSelection,
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

export type MarkdownEditorRootProps = MarkdownEditorAccessibleNameProps &
  MarkdownEditorValueOwnership &
  MarkdownEditorModeOwnership & {
    "aria-describedby"?: string;
    "aria-invalid"?: AriaAttributes["aria-invalid"];
    autoFocus?: boolean;
    children: ReactNode;
    disabled?: boolean;
    id?: string;
    initialSelection?: MarkdownEditorInitialSelection;
    maxLength?: number;
    onBlur?: FocusEventHandler<HTMLDivElement>;
    onFocus?: FocusEventHandler<HTMLDivElement>;
    placeholder?: string;
    readOnly?: boolean;
  };

export type MarkdownEditorConfiguration = Readonly<{
  ariaDescribedBy: string | undefined;
  ariaInvalid: AriaAttributes["aria-invalid"];
  ariaLabel: string | undefined;
  ariaLabelledBy: string | undefined;
  autoFocus: boolean;
  controlRef: Ref<HTMLElement>;
  disabled: boolean;
  id: string | undefined;
  initialSelection: MarkdownEditorInitialSelection;
  inputRef: RefObject<HTMLElement | null>;
  invalid: boolean;
  maxLength: number | undefined;
  mode: MarkdownEditorMode;
  onBlur: FocusEventHandler<HTMLDivElement> | undefined;
  onFocus: FocusEventHandler<HTMLDivElement> | undefined;
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

function isInvalid(value: AriaAttributes["aria-invalid"]) {
  return value !== undefined && value !== false && value !== "false";
}

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

export const MarkdownEditorRoot = forwardRef<HTMLElement, MarkdownEditorRootProps>(
  function MarkdownEditorRoot(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      autoFocus = false,
      children,
      defaultMode = "edit",
      defaultValue = "",
      disabled = false,
      id,
      initialSelection = "start",
      maxLength,
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
    const inputRef = useRef<HTMLElement>(null);
    const invalid = isInvalid(ariaInvalid);
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

    useLayoutEffect(() => {
      if (invalid && mode === "preview") {
        setMode("edit");
      }
    }, [invalid, mode, setMode]);

    const configuration = useMemo<MarkdownEditorConfiguration>(
      () => ({
        ariaDescribedBy,
        ariaInvalid,
        ariaLabel,
        ariaLabelledBy,
        autoFocus,
        controlRef: ref,
        disabled,
        id,
        initialSelection,
        inputRef,
        invalid,
        maxLength,
        mode,
        onBlur,
        onFocus,
        placeholder,
        readOnly,
        setMode,
      }),
      [
        ariaDescribedBy,
        ariaInvalid,
        ariaLabel,
        ariaLabelledBy,
        autoFocus,
        disabled,
        id,
        initialSelection,
        invalid,
        maxLength,
        mode,
        onBlur,
        onFocus,
        placeholder,
        readOnly,
        ref,
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
        runMarkdownEditorCommand(configuration.inputRef.current, command),
      setMode: configuration.setMode,
      setValue: document.setValue,
      value: document.value,
    }),
    [configuration, document],
  );
}
