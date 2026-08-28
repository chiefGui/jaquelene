import {
  Combobox,
  ComboboxItem,
  ComboboxList,
  ComboboxPopover,
  ComboboxProvider,
  useComboboxContext,
  type ComboboxPopoverProps,
} from "@ariakit/react/combobox";
import { useStoreState } from "@ariakit/react/store";
import { Tab, TabList, TabPanel, TabProvider } from "@ariakit/react/tab";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import RoboticIcon from "@hugeicons/core-free-icons/RoboticIcon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import Tick01Icon from "@hugeicons/core-free-icons/Tick01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AvailableModel, ModelProvider, ModelReference } from "@jaquelene/ipc/renderer";
import { Button, Input, Skeleton, cn } from "@jaquelene/ui";
import { Popover } from "@jaquelene/ui/popover";
import { useReducedMotion } from "@jaquelene/ui/motion";
import { Select, type SelectProps } from "@jaquelene/ui/select";
import { Tooltip } from "@jaquelene/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { BrandMark, getBrandName } from "@/feature/brand/catalog";
import { ProviderMark } from "@/feature/provider/mark";
import { modelProvidersQuery, modelsForProviderQuery } from "./catalog-query";

type ProviderTab = ModelProvider & { brandName: string; tabId: string };

type ModelOption = {
  brandName: string;
  children: string;
  id: string;
  model: AvailableModel;
  searchText: string;
  typeaheadText: string;
  value: string;
};

type ModelListState =
  | { status: "loading" }
  | { status: "error"; reload: () => void }
  | { status: "ready"; options: ModelOption[] };

type ProviderListStatus = "loading" | "empty" | "ready";

type ModelPickerContextValue = {
  activeProvider: ProviderTab | undefined;
  inputValue: string;
  modelList: ModelListState;
  pendingModelId: string | null;
  providerListStatus: ProviderListStatus;
  providers: ProviderTab[];
  selectionError: string | null;
  selectedModel: AvailableModel | undefined;
  selectProvider: (tabId: string | null | undefined) => void;
  value: ModelReference | null;
};

const ModelPickerContext = createContext<ModelPickerContextValue | null>(null);
const modelOptionHeight = 56;
const modelOptionGap = 4;
const modelOptionSize = modelOptionHeight + modelOptionGap;

function ModelMark({ brandId, className }: { brandId: string; className?: string }) {
  return <BrandMark brandId={brandId} fallbackIcon={RoboticIcon} className={className} />;
}

function useModelPicker(component: string) {
  const context = useContext(ModelPickerContext);

  if (!context) {
    throw new Error(`ModelPicker.${component} must be rendered inside ModelPicker.Root.`);
  }

  return context;
}

type ModelPickerRootProps = {
  children: ReactNode;
  value: ModelReference | null;
  onValueChange: (value: ModelReference) => void | Promise<void>;
};

function ModelPickerRoot({ children, value, onValueChange }: ModelPickerRootProps) {
  const providersQuery = useQuery({ ...modelProvidersQuery, throwOnError: true });
  const modelProviders = providersQuery.data ?? [];
  const pickerId = useId();
  const providers = modelProviders.map((provider) => ({
    ...provider,
    brandName: getBrandName(provider.brandId),
    tabId: `${pickerId}-provider-${encodeURIComponent(provider.id)}`,
  }));
  const preferredProvider = providers.find(({ id }) => id === value?.providerId) ?? providers[0];
  const providerListStatus: ProviderListStatus = providersQuery.isPending
    ? "loading"
    : providers.length > 0
      ? "ready"
      : "empty";
  const [providerId, setProviderId] = useState(preferredProvider?.id ?? "");
  const activeProvider = providers.find(({ id }) => id === providerId) ?? preferredProvider;
  const [open, setOpenState] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const modelsQuery = useQuery({
    ...modelsForProviderQuery(activeProvider?.id ?? ""),
    enabled: open && activeProvider !== undefined,
  });
  const modelOptions = useMemo(
    () =>
      (modelsQuery.data ?? []).map((model) => {
        const brandName = getBrandName(model.brandId);

        return {
          brandName,
          children: model.name,
          id: `${pickerId}-model-${encodeURIComponent(activeProvider?.id ?? "")}-${encodeURIComponent(model.id)}`,
          model,
          searchText: `${brandName} ${model.name} ${model.id}`.toLowerCase(),
          typeaheadText: `${model.name} ${brandName}`,
          value: model.id,
        };
      }),
    [activeProvider?.id, modelsQuery.data, pickerId],
  );
  const visibleModelOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();

    return query
      ? modelOptions.filter(({ searchText }) => searchText.includes(query))
      : modelOptions;
  }, [inputValue, modelOptions]);

  function reloadModels() {
    setSelectionError(null);
    void modelsQuery.refetch();
  }

  const modelList: ModelListState = modelsQuery.data
    ? { status: "ready", options: visibleModelOptions }
    : modelsQuery.isError
      ? { status: "error", reload: reloadModels }
      : { status: "loading" };
  const selectedModel =
    value && value.providerId === activeProvider?.id
      ? modelsQuery.data?.find(({ id }) => id === value.modelId)
      : undefined;

  function setOpen(nextOpen: boolean) {
    if (!nextOpen && pendingModelId !== null) {
      return;
    }

    setOpenState(nextOpen);
    setInputValue("");
    setSelectionError(null);

    if (nextOpen) {
      setProviderId(preferredProvider?.id ?? "");
    }
  }

  function selectProvider(tabId: string | null | undefined) {
    const provider = providers.find((candidate) => candidate.tabId === tabId);

    if (!provider || provider.id === activeProvider?.id) {
      return;
    }

    setProviderId(provider.id);
    setInputValue("");
    setSelectionError(null);
  }

  async function selectModel(modelId: string) {
    if (!activeProvider || pendingModelId !== null) {
      return;
    }

    if (value?.providerId === activeProvider.id && value.modelId === modelId) {
      setOpenState(false);
      return;
    }

    setPendingModelId(modelId);
    setSelectionError(null);

    try {
      await onValueChange({ providerId: activeProvider.id, modelId });
      setOpenState(false);
      setInputValue("");
    } catch (cause) {
      console.error("Could not select model.", cause);
      setSelectionError("Couldn't select this model.");
    } finally {
      setPendingModelId(null);
    }
  }

  const context = {
    activeProvider,
    inputValue,
    modelList,
    pendingModelId,
    providerListStatus,
    providers,
    selectionError,
    selectedModel,
    selectProvider,
    value,
  } satisfies ModelPickerContextValue;

  return (
    <ComboboxProvider
      items={modelList.status === "ready" ? modelList.options : []}
      open={open}
      setOpen={setOpen}
      inputValue={inputValue}
      setInputValue={(nextInputValue) => {
        setInputValue(nextInputValue);
        setSelectionError(null);
      }}
      selectedValue={value !== null && value.providerId === activeProvider?.id ? value.modelId : ""}
      setSelectedValue={(modelId) => {
        if (modelId) {
          void selectModel(modelId);
        }
      }}
      selectOnMove={false}
      focusLoop
      placement="bottom-end"
    >
      <ModelPickerContext.Provider value={context}>{children}</ModelPickerContext.Provider>
    </ComboboxProvider>
  );
}

function ModelPickerValue({
  className,
  ...props
}: ComponentProps<"span"> & { placeholder?: string }) {
  const { placeholder = "Choose model", ...spanProps } = props;
  const { providers, selectedModel, value } = useModelPicker("Value");
  const selectedProvider = providers.some(({ id }) => id === value?.providerId);
  const label =
    selectedModel?.name ?? (selectedProvider ? value?.modelId : undefined) ?? placeholder;

  return (
    <span
      {...spanProps}
      className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", className)}
    >
      {selectedModel ? (
        <ModelMark brandId={selectedModel.brandId} className="size-3.5 text-muted" />
      ) : null}
      <Select.Value className="truncate">{label}</Select.Value>
    </span>
  );
}

function ModelPickerTrigger({ children, className, disabled, ...props }: SelectProps) {
  const { pendingModelId, providerListStatus } = useModelPicker("Trigger");

  if (providerListStatus === "empty") {
    return null;
  }

  return (
    <Select
      {...props}
      aria-busy={providerListStatus === "loading"}
      disabled={disabled || providerListStatus !== "ready" || pendingModelId !== null}
      className={cn("min-w-48 max-w-72", className)}
    >
      {children ?? <ModelPickerValue />}
    </Select>
  );
}

function ModelPickerEmpty({ children }: { children: ReactNode }) {
  const { providerListStatus } = useModelPicker("Empty");

  return providerListStatus === "empty" ? children : null;
}

function ModelPickerList({ options }: { options: ModelOption[] }) {
  const combobox = useComboboxContext();
  const reducedMotion = useReducedMotion();
  const activeId = useStoreState(combobox, "activeId");
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const { activeProvider, pendingModelId, value } = useModelPicker("Models");
  const activeIndex = options.findIndex(({ id }) => id === activeId);
  const getItemKey = useCallback((index: number) => options[index]?.value ?? index, [options]);
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);

      if (activeIndex < 0 || indexes.includes(activeIndex)) {
        return indexes;
      }

      return [...indexes, activeIndex].sort((left, right) => left - right);
    },
    [activeIndex],
  );
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: options.length,
    directDomUpdates: true,
    estimateSize: () => modelOptionSize,
    getItemKey,
    getScrollElement: () => scrollElementRef.current,
    overscan: 6,
    rangeExtractor,
    useFlushSync: false,
  });

  useEffect(() => {
    if (activeIndex >= 0) {
      virtualizer.scrollToIndex(activeIndex, { align: "auto" });
    }
  }, [activeIndex, virtualizer]);

  return (
    <ComboboxList
      ref={scrollElementRef}
      aria-busy={pendingModelId !== null}
      aria-label={`${activeProvider?.brandName ?? "Provider"} models`}
      className="min-h-0 flex-1 overflow-y-auto p-2"
    >
      <div ref={virtualizer.containerRef} className="relative w-full">
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const option = options[virtualItem.index];

          if (!option) {
            return null;
          }

          const { brandName, model } = option;
          const selected =
            value !== null && value.providerId === activeProvider?.id && value.modelId === model.id;
          const pending = pendingModelId === model.id;

          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              role="presentation"
              className="absolute top-0 left-0 w-full"
              style={{ height: modelOptionSize, paddingBottom: modelOptionGap }}
            >
              <ComboboxItem
                id={option.id}
                value={option.value}
                disabled={pendingModelId !== null}
                hideOnClick={false}
                typeaheadText={option.typeaheadText}
                aria-busy={pending}
                aria-posinset={virtualItem.index + 1}
                aria-setsize={options.length}
                className="group flex h-full w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm outline-none hover:bg-accent/10 focus:bg-accent/10 data-active-item:bg-accent/10 aria-disabled:opacity-50 aria-selected:bg-accent/10 aria-selected:hover:bg-accent/15"
              >
                <span className="flex min-w-0 items-start gap-3">
                  <ModelMark
                    brandId={model.brandId}
                    className="mt-0.5 size-4 text-muted group-hover:text-foreground group-focus:text-foreground group-data-active-item:text-foreground group-aria-selected:text-foreground"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-foreground/75 group-hover:text-foreground group-focus:text-foreground group-data-active-item:text-foreground group-aria-selected:text-foreground">
                      {model.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {brandName} &middot; {model.id}
                    </span>
                  </span>
                </span>

                {pending ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className={cn("shrink-0 text-muted", !reducedMotion && "animate-spin")}
                  />
                ) : selected ? (
                  <HugeiconsIcon
                    icon={Tick01Icon}
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className="shrink-0 text-accent"
                  />
                ) : null}
              </ComboboxItem>
            </div>
          );
        })}
      </div>
    </ComboboxList>
  );
}

function ModelPickerModels() {
  const { inputValue, modelList, selectionError } = useModelPicker("Content");

  if (modelList.status === "loading") {
    return (
      <div role="status" className="min-h-0 flex-1 overflow-hidden p-2">
        <span className="sr-only">Loading models...</span>

        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex h-14 items-start gap-3 px-3 py-2">
              <Skeleton className="mt-0.5 size-4 shrink-0 rounded-sm" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="mt-1.5 h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (modelList.status === "error") {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
        <div>
          <p role="alert" className="text-sm text-muted">
            Couldn't load models.
          </p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button variant="ghost" onClick={modelList.reload}>
              Retry
            </Button>
            <Link
              to="/settings/providers"
              className="rounded-sm text-sm text-muted outline-none hover:text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
            >
              Provider settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (modelList.options.length === 0) {
    return (
      <p role="status" className="grid min-h-0 flex-1 place-items-center text-sm text-muted">
        {inputValue.trim() ? "No matching models." : "No models available."}
      </p>
    );
  }

  return (
    <>
      <ModelPickerList options={modelList.options} />

      {selectionError ? (
        <p
          role="alert"
          className="shrink-0 border-t border-surface-raised-border px-3 py-2 text-xs text-danger"
        >
          {selectionError}
        </p>
      ) : null}
    </>
  );
}

type ModelPickerContentProps = Omit<
  ComboboxPopoverProps,
  "alwaysVisible" | "children" | "render" | "unmountOnHide"
>;

function ModelPickerContent({ className, ...props }: ModelPickerContentProps) {
  const combobox = useComboboxContext();
  const mounted = useStoreState(combobox, "mounted") ?? false;
  const { activeProvider, pendingModelId, providerListStatus, providers, selectProvider } =
    useModelPicker("Content");

  if (providerListStatus !== "ready") {
    return null;
  }

  return (
    <Popover.Presence present={mounted}>
      <ComboboxPopover
        portal
        gutter={8}
        alwaysVisible
        aria-label="Choose a model"
        {...props}
        render={<Popover.Surface />}
        role="dialog"
        className={cn(
          "z-50 h-[26rem] w-[38rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-surface-raised-border bg-surface-raised text-foreground shadow-2xl outline-none",
          className,
        )}
      >
        <TabProvider
          selectedId={activeProvider?.tabId}
          setSelectedId={selectProvider}
          orientation="vertical"
        >
          <div className="grid h-full min-h-0 grid-cols-[3.0625rem_minmax(0,1fr)]">
            <TabList
              aria-label="Providers"
              className="flex min-h-0 flex-col items-center gap-1 overflow-y-auto border-r border-surface-raised-border p-2"
            >
              {providers.map((provider) => (
                <Tooltip.Root key={provider.id} placement="left">
                  <Tooltip.Anchor
                    render={
                      <Tab
                        id={provider.tabId}
                        aria-label={provider.brandName}
                        disabled={pendingModelId !== null}
                        render={
                          <Button
                            variant="ghost"
                            className="w-control px-0 text-muted not-disabled:hover:bg-accent/10 aria-selected:bg-accent/10 aria-selected:text-foreground aria-selected:not-disabled:hover:bg-accent/15"
                          />
                        }
                      />
                    }
                  >
                    <ProviderMark brandId={provider.brandId} className="size-4" />
                  </Tooltip.Anchor>

                  <Tooltip>{provider.brandName}</Tooltip>
                </Tooltip.Root>
              ))}
            </TabList>

            {activeProvider ? (
              <TabPanel
                tabId={activeProvider.tabId}
                tabIndex={-1}
                className="flex min-h-0 flex-col outline-none"
              >
                <div className="relative shrink-0 border-b border-surface-raised-border p-2">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-muted"
                  />
                  <Combobox
                    autoSelect="always"
                    getAutoSelectId={(items) =>
                      items.find((item) => !item.disabled && item.value)?.id
                    }
                    aria-label="Search models"
                    placeholder="Search models..."
                    render={
                      <Input className="h-10 w-full border-0 bg-transparent pr-3 pl-9 focus:border-0 focus:bg-transparent" />
                    }
                  />
                </div>

                <ModelPickerModels />
              </TabPanel>
            ) : null}
          </div>
        </TabProvider>
      </ComboboxPopover>
    </Popover.Presence>
  );
}

export const ModelPicker = {
  Root: ModelPickerRoot,
  Trigger: ModelPickerTrigger,
  Value: ModelPickerValue,
  Empty: ModelPickerEmpty,
  Content: ModelPickerContent,
} as const;
