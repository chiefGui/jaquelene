import {
  Combobox,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  useComboboxContext,
  type ComboboxPopoverProps,
} from "@ariakit/react/combobox";
import { useStoreState } from "@ariakit/react/store";
import { Tab, TabList, TabPanel, TabProvider } from "@ariakit/react/tab";
import RoboticIcon from "@hugeicons/core-free-icons/RoboticIcon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import StarIcon from "@hugeicons/core-free-icons/StarIcon";
import Tick01Icon from "@hugeicons/core-free-icons/Tick01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AvailableModel, ModelProvider, ModelReference } from "@jaquelene/ipc/renderer";
import { Button, Input, Skeleton, cn } from "@jaquelene/ui";
import { Popover } from "@jaquelene/ui/popover";
import { Select, type SelectProps } from "@jaquelene/ui/select";
import { Tooltip } from "@jaquelene/ui/tooltip";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
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
import {
  favoriteModelsQuery,
  usePendingFavoriteModels,
  useSetFavoriteModel,
} from "./favorite-models";

type ProviderTab = ModelProvider & {
  brandName: string;
  tabId: string;
  type: "provider";
};

type FavoriteTab = {
  tabId: string;
  type: "favorites";
};

type ModelTab = FavoriteTab | ProviderTab;

type ModelOption = {
  children: string;
  favorite: boolean;
  id: string;
  model: AvailableModel;
  modelBrandName: string;
  provider: ProviderTab;
  reference: ModelReference;
  searchText: string;
  typeaheadText: string;
  value: string;
};

type ProviderModelsState =
  | { status: "loading" }
  | { status: "error"; reload: () => void }
  | {
      status: "ready";
      catalogs: { models: AvailableModel[]; provider: ProviderTab }[];
    };

type ModelListState =
  | { status: "loading" }
  | { status: "error"; reload: () => void }
  | { status: "ready"; options: ModelOption[] };

type ModelPickerStatus = "loading" | "empty" | "ready";

type ModelPickerContextValue = {
  activeTab: ModelTab;
  actionError: string | null;
  inputValue: string;
  modelList: ModelListState;
  pendingFavorites: ModelReference[];
  pickerStatus: ModelPickerStatus;
  selectTab: (tabId: string | null | undefined) => void;
  setFavorite: (reference: ModelReference, favorite: boolean) => void;
  tabs: ModelTab[];
  value: ModelReference | null;
};

const ModelPickerContext = createContext<ModelPickerContextValue | null>(null);
const modelOptionHeight = 56;
const modelOptionGap = 4;
const modelOptionSize = modelOptionHeight + modelOptionGap;
const modelRowLayoutClassName =
  "grid grid-cols-[1rem_minmax(0,1fr)_2rem] items-center gap-2 px-3 py-2";

function ModelMark({ brandId, className }: { brandId: string; className?: string }) {
  return <BrandMark brandId={brandId} fallbackIcon={RoboticIcon} className={className} />;
}

function sameModel(left: ModelReference, right: ModelReference) {
  return left.providerId === right.providerId && left.modelId === right.modelId;
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
  onValueChange: (value: ModelReference) => void;
};

function ModelPickerRoot({ children, value, onValueChange }: ModelPickerRootProps) {
  const providersQuery = useQuery({ ...modelProvidersQuery, throwOnError: true });
  const favoriteModels = useQuery({ ...favoriteModelsQuery, throwOnError: true });
  const setFavoriteModel = useSetFavoriteModel();
  const pendingFavorites = usePendingFavoriteModels();
  const pickerId = useId();
  const providers = useMemo(
    () =>
      (providersQuery.data ?? []).map((provider) => ({
        ...provider,
        brandName: getBrandName(provider.brandId),
        tabId: `${pickerId}-provider-${encodeURIComponent(provider.id)}`,
        type: "provider" as const,
      })),
    [pickerId, providersQuery.data],
  );
  const favoriteTab = useMemo(
    () => ({ tabId: `${pickerId}-favorites`, type: "favorites" as const }),
    [pickerId],
  );
  const tabs = useMemo<ModelTab[]>(() => [favoriteTab, ...providers], [favoriteTab, providers]);
  const favorites = favoriteModels.data ?? [];
  const favoriteModelIdsByProvider = useMemo(() => {
    const modelIdsByProvider = new Map<string, Set<string>>();

    for (const { modelId, providerId } of favorites) {
      const modelIds = modelIdsByProvider.get(providerId) ?? new Set<string>();
      modelIds.add(modelId);
      modelIdsByProvider.set(providerId, modelIds);
    }

    return modelIdsByProvider;
  }, [favorites]);
  const preferredProvider = providers.find(({ id }) => id === value?.providerId) ?? providers[0];
  const pickerStatus: ModelPickerStatus =
    providersQuery.isPending || favoriteModels.isPending
      ? "loading"
      : providers.length > 0
        ? "ready"
        : "empty";
  const [selectedTabId, setSelectedTabId] = useState<string>();
  const activeTab =
    tabs.find(({ tabId }) => tabId === selectedTabId) ?? preferredProvider ?? favoriteTab;
  const [open, setOpenState] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const requestedProviders = useMemo(() => {
    if (activeTab.type === "provider") {
      return [activeTab];
    }

    return providers.filter(({ id }) => favoriteModelIdsByProvider.has(id));
  }, [activeTab, favoriteModelIdsByProvider, providers]);
  const combineProviderModels = useCallback(
    (results: UseQueryResult<AvailableModel[], Error>[]): ProviderModelsState => {
      if (results.every(({ data }) => data !== undefined)) {
        return {
          status: "ready",
          catalogs: results.map((result, index) => ({
            models: result.data!,
            provider: requestedProviders[index]!,
          })),
        };
      }

      if (results.some(({ isError }) => isError)) {
        return {
          status: "error",
          reload() {
            for (const result of results) {
              if (result.isError) {
                void result.refetch();
              }
            }
          },
        };
      }

      return { status: "loading" };
    },
    [requestedProviders],
  );
  const providerModels = useQueries({
    queries: requestedProviders.map((provider) => ({
      ...modelsForProviderQuery(provider.id),
      enabled: open,
    })),
    combine: combineProviderModels,
  });
  const modelOptions = useMemo(() => {
    if (providerModels.status !== "ready") {
      return [];
    }

    function createOption(provider: ProviderTab, model: AvailableModel): ModelOption {
      const reference = { providerId: provider.id, modelId: model.id };
      const modelBrandName = getBrandName(model.brandId);
      const id = `${pickerId}-model-${encodeURIComponent(provider.id)}-${encodeURIComponent(model.id)}`;

      return {
        children: model.name,
        favorite: favoriteModelIdsByProvider.get(provider.id)?.has(model.id) ?? false,
        id,
        model,
        modelBrandName,
        provider,
        reference,
        searchText:
          `${provider.brandName} ${provider.id} ${modelBrandName} ${model.name} ${model.id}`.toLowerCase(),
        typeaheadText: `${model.name} ${modelBrandName} ${provider.brandName}`,
        value: id,
      };
    }

    if (activeTab.type === "provider") {
      const catalog = providerModels.catalogs.find(({ provider }) => provider.id === activeTab.id);
      return catalog?.models.map((model) => createOption(activeTab, model)) ?? [];
    }

    const catalogs = new Map(
      providerModels.catalogs.map(({ models, provider }) => [
        provider.id,
        { models: new Map(models.map((model) => [model.id, model])), provider },
      ]),
    );

    return favorites.flatMap((reference) => {
      const catalog = catalogs.get(reference.providerId);
      const model = catalog?.models.get(reference.modelId);
      return catalog && model ? [createOption(catalog.provider, model)] : [];
    });
  }, [activeTab, favoriteModelIdsByProvider, favorites, pickerId, providerModels]);
  const visibleModelOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();

    return query
      ? modelOptions.filter(({ searchText }) => searchText.includes(query))
      : modelOptions;
  }, [inputValue, modelOptions]);

  function reloadModels() {
    setActionError(null);

    if (providerModels.status === "error") {
      providerModels.reload();
    }
  }

  const modelList: ModelListState =
    providerModels.status === "ready"
      ? { status: "ready", options: visibleModelOptions }
      : providerModels.status === "error"
        ? { status: "error", reload: reloadModels }
        : { status: "loading" };
  const selectedOption = value
    ? modelOptions.find(({ reference }) => sameModel(reference, value))
    : undefined;

  function setOpen(nextOpen: boolean) {
    setOpenState(nextOpen);
    setInputValue("");
    setActionError(null);

    if (nextOpen) {
      setSelectedTabId(preferredProvider?.tabId);
    }
  }

  function selectTab(tabId: string | null | undefined) {
    const tab = tabs.find((candidate) => candidate.tabId === tabId);

    if (!tab || tab.tabId === activeTab.tabId) {
      return;
    }

    setSelectedTabId(tab.tabId);
    setInputValue("");
    setActionError(null);
  }

  function selectModel(reference: ModelReference) {
    if (value && sameModel(value, reference)) {
      setOpenState(false);
      return;
    }

    setActionError(null);

    try {
      onValueChange({ ...reference });
      setOpenState(false);
      setInputValue("");
    } catch (cause) {
      console.error("Could not select model.", cause);
      setActionError("Couldn't select this model.");
    }
  }

  async function setFavorite(reference: ModelReference, favorite: boolean) {
    setActionError(null);

    try {
      await setFavoriteModel.mutateAsync({ favorite, reference });
    } catch (cause) {
      console.error("Could not update favorite models.", cause);
      setActionError("Couldn't update favorite models.");
    }
  }

  const context = {
    activeTab,
    actionError,
    inputValue,
    modelList,
    pendingFavorites,
    pickerStatus,
    selectTab,
    setFavorite,
    tabs,
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
        setActionError(null);
      }}
      selectedValue={selectedOption?.value ?? ""}
      setSelectedValue={(optionValue) => {
        const option = modelOptions.find(({ value: candidate }) => candidate === optionValue);

        if (option) {
          selectModel(option.reference);
        }
      }}
      selectOnMove={false}
      focusLoop
    >
      <ModelPickerContext.Provider value={context}>{children}</ModelPickerContext.Provider>
    </ComboboxProvider>
  );
}

function ModelPickerSelectedValue({
  fallback,
  reference,
}: {
  fallback: string;
  reference: ModelReference;
}) {
  const cachedModelsQuery = useQuery({
    ...modelsForProviderQuery(reference.providerId),
    enabled: false,
  });
  const model = cachedModelsQuery.data?.find(({ id }) => id === reference.modelId);

  return (
    <>
      {model ? (
        <ModelMark
          brandId={model.brandId}
          className="col-start-1 row-start-1 size-3.5 text-muted"
        />
      ) : null}
      <Select.Value className="col-start-2 row-start-1 truncate">
        {model?.name ?? fallback}
      </Select.Value>
    </>
  );
}

function ModelPickerValue({
  className,
  ...props
}: ComponentProps<"span"> & { placeholder?: string }) {
  const { placeholder = "Choose model", ...spanProps } = props;
  const { tabs, value } = useModelPicker("Value");
  const selectedProvider = tabs.some(
    (tab) => tab.type === "provider" && tab.id === value?.providerId,
  );

  return (
    <span
      {...spanProps}
      className={cn(
        "grid min-w-0 flex-1 grid-cols-[0.875rem_minmax(0,1fr)] items-center gap-2 text-left",
        className,
      )}
    >
      {value ? (
        <ModelPickerSelectedValue
          reference={value}
          fallback={selectedProvider ? value.modelId : placeholder}
        />
      ) : (
        <Select.Value className="col-span-2 truncate">{placeholder}</Select.Value>
      )}
    </span>
  );
}

function ModelPickerTrigger({ children, className, disabled, ...props }: SelectProps) {
  const { pickerStatus } = useModelPicker("Trigger");

  if (pickerStatus === "empty") {
    return null;
  }

  return (
    <Select
      {...props}
      aria-busy={pickerStatus === "loading"}
      disabled={disabled || pickerStatus !== "ready"}
      className={cn("w-72 max-w-[calc(100vw-3rem)]", className)}
    >
      {children ?? <ModelPickerValue />}
    </Select>
  );
}

function ModelPickerEmpty({ children }: { children: ReactNode }) {
  const { pickerStatus } = useModelPicker("Empty");

  return pickerStatus === "empty" ? children : null;
}

function ModelPickerList({ options }: { options: ModelOption[] }) {
  const combobox = useComboboxContext();
  const activeId = useStoreState(combobox, "activeId");
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const { activeTab, pendingFavorites, setFavorite, value } = useModelPicker("Models");
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
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
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
    <div
      ref={scrollElementRef}
      className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-gutter:stable]"
    >
      <ul
        ref={virtualizer.containerRef}
        aria-label={
          activeTab.type === "favorites" ? "Favorite models" : `${activeTab.brandName} models`
        }
        className="relative w-full"
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const option = options[virtualItem.index];

          if (!option) {
            return null;
          }

          const { favorite, model, modelBrandName, provider, reference } = option;
          const active = virtualItem.index === activeIndex;
          const selected = value !== null && sameModel(value, reference);
          const updatingFavorite = pendingFavorites.some((pending) =>
            sameModel(pending, reference),
          );

          return (
            <li
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              aria-posinset={virtualItem.index + 1}
              aria-setsize={options.length}
              className="absolute top-0 left-0 w-full"
              style={{ height: modelOptionSize, paddingBottom: modelOptionGap }}
            >
              <div
                data-active-item={active || undefined}
                className={cn(
                  modelRowLayoutClassName,
                  "group h-full w-full rounded-lg text-sm hover:bg-accent/10 focus-within:bg-accent/10 data-active-item:bg-accent/10",
                  selected && "bg-accent/10 hover:bg-accent/15",
                )}
              >
                <ComboboxItem
                  id={option.id}
                  value={option.value}
                  hideOnClick={false}
                  typeaheadText={option.typeaheadText}
                  render={<button type="button" />}
                  role="button"
                  aria-current={selected || undefined}
                  aria-selected={undefined}
                  className="col-span-2 row-start-1 grid h-full min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-start gap-2 text-left outline-none"
                >
                  {selected ? (
                    <HugeiconsIcon
                      icon={Tick01Icon}
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden="true"
                      className="col-start-1 row-start-1 mt-0.5 self-start text-accent"
                    />
                  ) : null}

                  <span className="col-start-2 row-start-1 flex min-w-0 items-start gap-3">
                    <ModelMark
                      brandId={model.brandId}
                      className={cn(
                        "mt-0.5 size-4 text-muted group-hover:text-foreground group-focus-within:text-foreground group-data-active-item:text-foreground",
                        selected && "text-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-foreground/75 group-hover:text-foreground group-focus-within:text-foreground group-data-active-item:text-foreground",
                          selected && "text-foreground",
                        )}
                      >
                        {model.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {activeTab.type === "favorites" ? (
                          <>
                            {provider.brandName} &middot; {modelBrandName} &middot; {model.id}
                          </>
                        ) : (
                          <>
                            {modelBrandName} &middot; {model.id}
                          </>
                        )}
                      </span>
                    </span>
                  </span>
                </ComboboxItem>

                <Button
                  type="button"
                  variant="ghost"
                  aria-busy={updatingFavorite}
                  aria-label={
                    favorite
                      ? `Remove ${model.name} on ${provider.brandName} from favorites`
                      : `Add ${model.name} on ${provider.brandName} to favorites`
                  }
                  aria-pressed={favorite}
                  disabled={updatingFavorite}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setFavorite(reference, !favorite)}
                  className={cn(
                    "col-start-3 row-start-1 size-8 px-0 hover:bg-accent/10 hover:text-accent aria-disabled:opacity-100 disabled:opacity-100 group-data-active-item:opacity-100 group-focus-within:opacity-100",
                    favorite ? "text-accent" : "text-muted opacity-0 group-hover:opacity-100",
                  )}
                >
                  <HugeiconsIcon
                    icon={StarIcon}
                    size={16}
                    strokeWidth={1.5}
                    fill={favorite ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ModelPickerModels() {
  const { actionError, activeTab, inputValue, modelList } = useModelPicker("Content");

  if (modelList.status === "loading") {
    return (
      <div role="status" className="min-h-0 flex-1 overflow-hidden p-2 [scrollbar-gutter:stable]">
        <span className="sr-only">Loading models...</span>

        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={cn(modelRowLayoutClassName, "h-14")}>
              <div className="col-start-2 flex min-w-0 items-start gap-3">
                <Skeleton className="mt-0.5 size-4 shrink-0 rounded-sm" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="mt-1.5 h-3 w-3/5" />
                </div>
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

  return (
    <>
      {modelList.options.length > 0 ? (
        <ModelPickerList options={modelList.options} />
      ) : (
        <p role="status" className="grid min-h-0 flex-1 place-items-center text-sm text-muted">
          {inputValue.trim()
            ? "No matching models."
            : activeTab.type === "favorites"
              ? "No favorite models yet"
              : "No models available."}
        </p>
      )}

      {actionError ? (
        <p
          role="alert"
          className="shrink-0 border-t border-surface-raised-border px-3 py-2 text-xs text-danger"
        >
          {actionError}
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
  const { activeTab, pickerStatus, selectTab, tabs } = useModelPicker("Content");

  if (pickerStatus !== "ready") {
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
        <TabProvider selectedId={activeTab.tabId} setSelectedId={selectTab} orientation="vertical">
          <div className="grid h-full min-h-0 grid-cols-[3.0625rem_minmax(0,1fr)]">
            <TabList
              aria-label="Model sources"
              className="flex min-h-0 flex-col items-center gap-1 overflow-y-auto border-r border-surface-raised-border p-2"
            >
              {tabs.map((tab) => {
                const label = tab.type === "favorites" ? "Favorites" : tab.brandName;

                return (
                  <Tooltip.Root key={tab.tabId} placement="left">
                    <Tooltip.Anchor
                      render={
                        <Tab
                          id={tab.tabId}
                          aria-label={label}
                          render={
                            <Button
                              variant="ghost"
                              className="w-control px-0 text-muted not-disabled:hover:bg-accent/10 aria-selected:bg-accent/10 aria-selected:text-foreground aria-selected:not-disabled:hover:bg-accent/15"
                            />
                          }
                        />
                      }
                    >
                      {tab.type === "favorites" ? (
                        <HugeiconsIcon
                          icon={StarIcon}
                          size={16}
                          strokeWidth={1.5}
                          aria-hidden="true"
                          className="size-4"
                        />
                      ) : (
                        <ProviderMark brandId={tab.brandId} className="size-4" />
                      )}
                    </Tooltip.Anchor>

                    <Tooltip>{label}</Tooltip>
                  </Tooltip.Root>
                );
              })}
            </TabList>

            <TabPanel
              tabId={activeTab.tabId}
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
