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
import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import Brain01Icon from "@hugeicons/core-free-icons/Brain01Icon";
import RoboticIcon from "@hugeicons/core-free-icons/RoboticIcon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import StarIcon from "@hugeicons/core-free-icons/StarIcon";
import Tick01Icon from "@hugeicons/core-free-icons/Tick01Icon";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  ReasoningPreset,
  type AvailableModel,
  type ModelCatalogSnapshot,
  type ModelProvider,
  type ModelReference,
  type ModelSelection,
} from "@jaquelene/ipc/renderer";
import { Button, IconFrame, Input, Skeleton } from "@jaquelene/ui";
import { Popover } from "@jaquelene/ui/popover";
import { Select, type SelectProps } from "@jaquelene/ui/select";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import { Tooltip } from "@jaquelene/ui/tooltip";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import {
  useQueries,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { BrandMark, getBrandName } from "@/feature/brand/catalog";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ProviderMark } from "@/feature/provider/mark";
import { forceRefreshModels, modelProvidersQuery, modelsForProviderQuery } from "./catalog-query";
import {
  favoriteModelsQuery,
  usePendingFavoriteModels,
  useSetFavoriteModel,
} from "./favorite-models";
import { formatTokenPrice } from "./format-token-price";

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

type ModelPickerStatus = "empty" | "ready";

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
  value: ModelSelection | null;
};

const ModelPickerContext = createContext<ModelPickerContextValue | null>(null);
const modelOptionHeight = 56;
const modelOptionGap = 4;
const modelOptionSize = modelOptionHeight + modelOptionGap;

function ModelMark({ brandId, style }: { brandId: string; style?: StyleXStyles }) {
  return <BrandMark brandId={brandId} fallbackIcon={RoboticIcon} style={style} />;
}

function ModelIndicator({
  children,
  label,
  style,
}: {
  children: ReactNode;
  label: string;
  style: StyleXStyles;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Anchor focusable={false} render={<IconFrame style={style} />}>
        {children}
        <VisuallyHidden>{label}</VisuallyHidden>
      </Tooltip.Anchor>

      <Tooltip>{label}</Tooltip>
    </Tooltip.Root>
  );
}

function ReasoningIndicator({ required }: { required: boolean }) {
  const label = required ? "Reasoning required" : "Supports reasoning";

  return (
    <ModelIndicator label={label} style={styles.reasoningIndicator}>
      <HugeiconsIcon icon={Brain01Icon} size={12} strokeWidth={1.5} aria-hidden="true" />
    </ModelIndicator>
  );
}

function FavoriteProviderIndicator({ provider }: { provider: ProviderTab }) {
  return (
    <ModelIndicator label={provider.brandName} style={styles.favoriteProviderIndicator}>
      <ProviderMark brandId={provider.brandId} style={styles.favoriteProviderMark} />
    </ModelIndicator>
  );
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
  value: ModelSelection | null;
  onValueChange: (value: ModelSelection, model: AvailableModel) => void;
};

function ModelPickerRoot({ children, value, onValueChange }: ModelPickerRootProps) {
  const [open, setOpenState] = useState(false);
  const queryClient = useQueryClient();
  const { data: modelProviders } = useSuspenseQuery(modelProvidersQuery);
  const favoriteModels = useQuery({
    ...favoriteModelsQuery,
    throwOnError: () => open,
  });
  const setFavoriteModel = useSetFavoriteModel();
  const pendingFavorites = usePendingFavoriteModels();
  const pickerId = useId();
  const providers = useMemo(
    () =>
      modelProviders.map((provider) => ({
        ...provider,
        brandName: getBrandName(provider.brandId),
        tabId: `${pickerId}-provider-${encodeURIComponent(provider.id)}`,
        type: "provider" as const,
      })),
    [modelProviders, pickerId],
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
  const pickerStatus: ModelPickerStatus = providers.length > 0 ? "ready" : "empty";
  const [selectedTabId, setSelectedTabId] = useState<string>();
  const activeTab =
    tabs.find(({ tabId }) => tabId === selectedTabId) ?? preferredProvider ?? favoriteTab;
  const [inputValue, setInputValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const requestedProviders = useMemo(() => {
    const providerIds = new Set(favoriteModelIdsByProvider.keys());

    if (activeTab.type === "provider") {
      providerIds.add(activeTab.id);
    }

    return providers.filter(({ id }) => providerIds.has(id));
  }, [activeTab, favoriteModelIdsByProvider, providers]);
  const combineProviderModels = useCallback(
    (results: UseQueryResult<ModelCatalogSnapshot, Error>[]): ProviderModelsState => {
      if (results.every(({ data }) => data !== undefined)) {
        return {
          status: "ready",
          catalogs: results.map((result, index) => ({
            models: result.data!.models,
            provider: requestedProviders[index]!,
          })),
        };
      }

      if (results.some(({ isError }) => isError)) {
        return {
          status: "error",
          reload() {
            for (const [index, result] of results.entries()) {
              if (result.isError) {
                const provider = requestedProviders[index];

                if (provider) {
                  void forceRefreshModels(queryClient, provider.id).catch(() => undefined);
                }
              }
            }
          },
        };
      }

      return { status: "loading" };
    },
    [queryClient, requestedProviders],
  );
  const providerModels = useQueries({
    queries: requestedProviders.map((provider) => modelsForProviderQuery(provider.id)),
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
      const selectedIsFavorite =
        value !== null && favoriteModelIdsByProvider.get(value.providerId)?.has(value.modelId);
      const initialTab = selectedIsFavorite ? favoriteTab : preferredProvider;
      setSelectedTabId(initialTab?.tabId);

      for (const provider of requestedProviders) {
        void queryClient.refetchQueries({
          queryKey: modelsForProviderQuery(provider.id).queryKey,
          exact: true,
          type: "active",
        });
      }
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

  function selectModel({ model, reference }: ModelOption) {
    if (value && sameModel(value, reference)) {
      setOpenState(false);
      return;
    }

    setActionError(null);
    onValueChange({ ...reference, name: model.name, brandId: model.brandId }, model);
    setOpenState(false);
    setInputValue("");
  }

  async function setFavorite(reference: ModelReference, favorite: boolean) {
    setActionError(null);

    try {
      await setFavoriteModel.mutateAsync({ favorite, reference });
    } catch (cause) {
      reportError("model.favorite.update", cause);
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
          selectModel(option);
        }
      }}
      selectOnMove={false}
      focusLoop
    >
      <ModelPickerContext.Provider value={context}>{children}</ModelPickerContext.Provider>
    </ComboboxProvider>
  );
}

function ModelPickerValue({
  style,
  ...props
}: Omit<ComponentProps<"span">, "className" | "style"> & {
  placeholder?: string;
  style?: StyleXStyles;
}) {
  const { placeholder = "Choose model", ...spanProps } = props;
  const { value } = useModelPicker("Value");

  return (
    <span {...spanProps} {...stylex.props(styles.value, style)}>
      {value ? (
        <>
          <ModelMark brandId={value.brandId} style={styles.selectedModelMark} />
          <Select.Value style={styles.selectedValue}>{value.name}</Select.Value>
        </>
      ) : (
        <Select.Value style={styles.placeholderValue}>{placeholder}</Select.Value>
      )}
    </span>
  );
}

function ModelPickerTrigger({ children, style, ...props }: SelectProps) {
  const { pickerStatus } = useModelPicker("Trigger");

  if (pickerStatus === "empty") {
    return null;
  }

  return (
    <Select {...props} style={[styles.trigger, style]}>
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

  useLayoutEffect(() => {
    if (activeIndex >= 0) {
      virtualizer.scrollToIndex(activeIndex, { align: "auto" });
    }
  }, [activeIndex, virtualizer]);

  return (
    <div ref={scrollElementRef} {...stylex.props(styles.modelListViewport)}>
      <ul
        ref={virtualizer.containerRef}
        aria-label={
          activeTab.type === "favorites" ? "Favorite models" : `${activeTab.brandName} models`
        }
        {...stylex.props(styles.modelList)}
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
              {...stylex.props(styles.virtualItem)}
            >
              <div
                data-active-item={active || undefined}
                {...stylex.props(
                  styles.modelRow,
                  styles.interactiveModelRow,
                  selected && styles.selectedModelRow,
                  stylex.defaultMarker(),
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
                  {...stylex.props(styles.modelOption)}
                >
                  {selected ? (
                    <HugeiconsIcon
                      icon={Tick01Icon}
                      size={16}
                      strokeWidth={1.5}
                      aria-hidden="true"
                      {...stylex.props(styles.selectedIndicator)}
                    />
                  ) : null}

                  <div {...stylex.props(styles.modelDetails)}>
                    <ModelMark
                      brandId={model.brandId}
                      style={[styles.modelMark, selected && styles.selectedModel]}
                    />
                    <div {...stylex.props(styles.modelText)}>
                      <div {...stylex.props(styles.modelTitle)}>
                        <span
                          {...stylex.props(styles.modelName, selected && styles.selectedModelName)}
                        >
                          {model.name}
                        </span>
                        {activeTab.type === "favorites" || model.reasoning ? (
                          <div {...stylex.props(styles.modelIndicators)}>
                            {activeTab.type === "favorites" ? (
                              <FavoriteProviderIndicator provider={provider} />
                            ) : null}
                            {model.reasoning ? (
                              <ReasoningIndicator
                                required={
                                  !model.reasoning.supportedPresets.includes(ReasoningPreset.Off)
                                }
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div {...stylex.props(styles.modelMetadata)}>
                        {activeTab.type === "provider" ? (
                          <>
                            {modelBrandName}
                            {" · "}
                          </>
                        ) : null}
                        {model.tokenPricing ? (
                          <>
                            Input {formatTokenPrice(model.tokenPricing.inputUsdPerMillion)}
                            {" · "}
                            Output {formatTokenPrice(model.tokenPricing.outputUsdPerMillion)}
                          </>
                        ) : (
                          "Pricing varies"
                        )}
                      </div>
                    </div>
                  </div>
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
                  style={[
                    styles.favoriteButton,
                    favorite ? styles.favoriteButtonOn : styles.favoriteButtonOff,
                  ]}
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
  const matchRoute = useMatchRoute();
  const settingsActive = Boolean(matchRoute({ to: "/settings", fuzzy: true }));

  if (modelList.status === "loading") {
    return (
      <div role="status" {...stylex.props(styles.loading)}>
        <VisuallyHidden>Loading models...</VisuallyHidden>

        <div {...stylex.props(styles.skeletonList)}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} {...stylex.props(styles.modelRow, styles.skeletonRow)}>
              <div {...stylex.props(styles.skeletonContent)}>
                <Skeleton style={styles.skeletonMark} />
                <div {...stylex.props(styles.skeletonText)}>
                  <Skeleton style={styles.skeletonTitle} />
                  <Skeleton style={styles.skeletonMetadata} />
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
      <div {...stylex.props(styles.centerState)}>
        <div>
          <p role="alert" {...stylex.props(styles.stateMessage)}>
            Couldn't load models.
          </p>
          <div {...stylex.props(styles.stateActions)}>
            <Button variant="ghost" onClick={modelList.reload}>
              Retry
            </Button>
            <Link
              to="/settings/providers"
              replace={settingsActive}
              {...stylex.props(styles.settingsLink)}
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
        <p role="status" {...stylex.props(styles.emptyState)}>
          {inputValue.trim()
            ? "No matching models."
            : activeTab.type === "favorites"
              ? "No favorite models yet"
              : "No models available."}
        </p>
      )}

      {actionError ? (
        <p role="alert" {...stylex.props(styles.actionError)}>
          {actionError}
        </p>
      ) : null}
    </>
  );
}

type ModelPickerContentProps = Omit<
  ComboboxPopoverProps,
  "alwaysVisible" | "children" | "className" | "render" | "style" | "unmountOnHide"
> & {
  style?: StyleXStyles;
};

function ModelPickerContent({ style, ...props }: ModelPickerContentProps) {
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
        {...stylex.props(styles.content, style)}
      >
        <TabProvider selectedId={activeTab.tabId} setSelectedId={selectTab} orientation="vertical">
          <div {...stylex.props(styles.contentLayout)}>
            <TabList aria-label="Model sources" {...stylex.props(styles.tabList)}>
              {tabs.map((tab) => {
                const label = tab.type === "favorites" ? "Favorites" : tab.brandName;

                return (
                  <Tooltip.Root key={tab.tabId} placement="left">
                    <Tooltip.Anchor
                      render={
                        <Tab
                          id={tab.tabId}
                          aria-label={label}
                          render={<Button variant="ghost" style={styles.tabButton} />}
                        />
                      }
                    >
                      {tab.type === "favorites" ? (
                        <HugeiconsIcon
                          icon={StarIcon}
                          size={16}
                          strokeWidth={1.5}
                          aria-hidden="true"
                          {...stylex.props(styles.tabMark)}
                        />
                      ) : (
                        <ProviderMark brandId={tab.brandId} style={styles.tabMark} />
                      )}
                    </Tooltip.Anchor>

                    <Tooltip>{label}</Tooltip>
                  </Tooltip.Root>
                );
              })}
            </TabList>

            <TabPanel tabId={activeTab.tabId} tabIndex={-1} {...stylex.props(styles.tabPanel)}>
              <div {...stylex.props(styles.search)}>
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={16}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  {...stylex.props(styles.searchIcon)}
                />
                <Combobox
                  autoSelect="always"
                  getAutoSelectId={(items) =>
                    items.find((item) => !item.disabled && item.value)?.id
                  }
                  aria-label="Search models"
                  placeholder="Search models..."
                  render={<Input style={styles.searchInput} />}
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

const activeBackground = colors.backgroundNeutralSubtler;
const activeModelName = colors.foregroundPrimary;
const focusOutline = colors.focusRing;

const styles = stylex.create({
  selectedModelMark: {
    color: colors.foregroundSecondary,
    gridColumnStart: "1",
    gridRowStart: "1",
    height: "0.875rem",
    width: "0.875rem",
  },
  selectedValue: {
    gridColumnStart: "2",
    gridRowStart: "1",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  value: {
    alignItems: "center",
    display: "grid",
    flex: 1,
    gap: "0.5rem",
    gridTemplateColumns: "0.875rem minmax(0, 1fr)",
    minWidth: 0,
    textAlign: "left",
  },
  placeholderValue: {
    gridColumn: "span 2 / span 2",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  trigger: {
    maxWidth: "calc(100vw - 3rem)",
    width: "18rem",
  },
  modelListViewport: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "0.5rem",
    scrollbarGutter: "stable",
  },
  modelList: {
    position: "relative",
    width: "100%",
  },
  virtualItem: {
    height: modelOptionSize,
    left: 0,
    paddingBottom: modelOptionGap,
    position: "absolute",
    top: 0,
    width: "100%",
  },
  modelRow: {
    alignItems: "center",
    display: "grid",
    gap: "0.5rem",
    gridTemplateColumns: "1rem minmax(0, 1fr) 2rem",
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  interactiveModelRow: {
    backgroundColor: {
      default: "transparent",
      ":focus-within": activeBackground,
      ":hover": activeBackground,
      ":is([data-active-item])": activeBackground,
    },
    borderRadius: tokens.radiusLarge,
    fontSize: tokens.fontSizeSmall,
    height: "100%",
    lineHeight: tokens.lineHeightSmall,
    width: "100%",
  },
  selectedModelRow: {
    backgroundColor: {
      default: colors.backgroundSelected,
      ":hover": colors.backgroundSelectedHover,
    },
  },
  modelOption: {
    alignContent: "center",
    alignItems: "flex-start",
    display: "grid",
    gap: "0.5rem",
    gridColumn: "span 2 / span 2",
    gridRowStart: "1",
    gridTemplateColumns: "1rem minmax(0, 1fr)",
    height: "100%",
    minWidth: 0,
    outline: "none",
    textAlign: "left",
  },
  selectedIndicator: {
    alignSelf: "flex-start",
    color: colors.foregroundAccent,
    gridColumnStart: "1",
    gridRowStart: "1",
    marginTop: "0.125rem",
  },
  modelDetails: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    gridColumnStart: "2",
    gridRowStart: "1",
    minWidth: 0,
  },
  modelMark: {
    color: {
      default: colors.foregroundSecondary,
      [stylex.when.ancestor(":focus-within")]: colors.foregroundPrimary,
      [stylex.when.ancestor(":hover")]: colors.foregroundPrimary,
      [stylex.when.ancestor("[data-active-item]")]: colors.foregroundPrimary,
    },
    height: "1rem",
    marginTop: "0.125rem",
    width: "1rem",
  },
  selectedModel: {
    color: colors.foregroundPrimary,
  },
  selectedModelName: {
    color: {
      default: colors.foregroundPrimary,
      [stylex.when.ancestor(":focus-within")]: activeModelName,
      [stylex.when.ancestor(":hover")]: activeModelName,
      [stylex.when.ancestor("[data-active-item]")]: activeModelName,
    },
  },
  modelText: {
    flex: 1,
    minWidth: 0,
  },
  modelTitle: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    minWidth: 0,
  },
  modelName: {
    color: {
      default: colors.foregroundPrimary,
      [stylex.when.ancestor(":focus-within")]: activeModelName,
      [stylex.when.ancestor(":hover")]: activeModelName,
      [stylex.when.ancestor("[data-active-item]")]: activeModelName,
    },
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  modelIndicators: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.25rem",
  },
  favoriteProviderIndicator: {
    backgroundColor: colors.backgroundNeutralSubtler,
    color: colors.foregroundSecondary,
    height: "1.125rem",
  },
  favoriteProviderMark: {
    height: "0.625rem",
    width: "0.625rem",
  },
  modelMetadata: {
    color: colors.foregroundSecondary,
    display: "block",
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginTop: "0.125rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  reasoningIndicator: {
    backgroundColor: colors.backgroundReasoningSubtle,
    color: colors.foregroundReasoning,
    height: "1.125rem",
  },
  favoriteButton: {
    backgroundColor: {
      default: "transparent",
      ":hover": activeBackground,
    },
    color: {
      default: null,
      ":hover": colors.foregroundAccent,
    },
    gridColumnStart: "3",
    gridRowStart: "1",
    height: "2rem",
    opacity: {
      default: null,
      ":disabled": 1,
      ':is([aria-disabled="true"])': 1,
      [stylex.when.ancestor(":focus-within")]: 1,
      [stylex.when.ancestor("[data-active-item]")]: 1,
    },
    paddingInline: 0,
    width: "2rem",
  },
  favoriteButtonOn: {
    color: colors.foregroundAccent,
    opacity: 1,
  },
  favoriteButtonOff: {
    color: colors.foregroundSecondary,
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
    },
  },
  loading: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    padding: "0.5rem",
    scrollbarGutter: "stable",
  },
  skeletonList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  skeletonRow: {
    height: modelOptionHeight,
  },
  skeletonContent: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    gridColumnStart: "2",
    minWidth: 0,
  },
  skeletonMark: {
    borderRadius: tokens.radiusSmall,
    flexShrink: 0,
    height: "1rem",
    marginTop: "0.125rem",
    width: "1rem",
  },
  skeletonText: {
    flex: 1,
    minWidth: 0,
  },
  skeletonTitle: {
    height: "1rem",
    width: "40%",
  },
  skeletonMetadata: {
    height: "0.75rem",
    marginTop: "0.375rem",
    width: "60%",
  },
  centerState: {
    display: "grid",
    flex: 1,
    minHeight: 0,
    padding: "1.5rem",
    placeItems: "center",
    textAlign: "center",
  },
  stateMessage: {
    color: colors.foregroundSecondary,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
  },
  stateActions: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "center",
    marginTop: "0.75rem",
  },
  settingsLink: {
    borderRadius: tokens.radiusSmall,
    color: {
      default: colors.foregroundSecondary,
      ":hover": colors.foregroundPrimary,
    },
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    outlineColor: {
      default: null,
      ":focus-visible": focusOutline,
    },
    outlineOffset: {
      default: null,
      ":focus-visible": 2,
    },
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: {
      default: null,
      ":focus-visible": 1,
    },
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
    textUnderlineOffset: {
      default: null,
      ":hover": 4,
    },
  },
  emptyState: {
    color: colors.foregroundSecondary,
    display: "grid",
    flex: 1,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    minHeight: 0,
    placeItems: "center",
  },
  actionError: {
    borderTopColor: colors.borderDefault,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: colors.foregroundDanger,
    flexShrink: 0,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    paddingBlock: "0.5rem",
    paddingInline: "0.75rem",
  },
  content: {
    backgroundColor: colors.backgroundSurfaceOverlay,
    borderColor: colors.borderDefault,
    borderRadius: tokens.radiusXLarge,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: tokens.shadowXLarge,
    color: colors.foregroundPrimary,
    height: "26rem",
    maxWidth: "calc(100vw - 2rem)",
    outline: "none",
    overflow: "hidden",
    width: "38rem",
    zIndex: 50,
  },
  contentLayout: {
    display: "grid",
    gridTemplateColumns: "3.0625rem minmax(0, 1fr)",
    height: "100%",
    minHeight: 0,
  },
  tabList: {
    alignItems: "center",
    borderRightColor: colors.borderDefault,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    minHeight: 0,
    overflowY: "auto",
    padding: "0.5rem",
  },
  tabButton: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": activeBackground,
      ':is([aria-selected="true"])': colors.backgroundSelected,
      ':is([aria-selected="true"]):not(:disabled):hover': colors.backgroundSelectedHover,
    },
    color: {
      default: colors.foregroundSecondary,
      ':is([aria-selected="true"])': colors.foregroundPrimary,
    },
    paddingInline: 0,
    width: tokens.controlHeight,
  },
  tabMark: {
    height: "1rem",
    width: "1rem",
  },
  tabPanel: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    outline: "none",
  },
  search: {
    borderBottomColor: colors.borderDefault,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    flexShrink: 0,
    padding: "0.5rem",
    position: "relative",
  },
  searchIcon: {
    color: colors.foregroundSecondary,
    left: "1.25rem",
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  searchInput: {
    backgroundColor: {
      default: "transparent",
      ":focus": "transparent",
    },
    borderWidth: 0,
    paddingLeft: "2.25rem",
    paddingRight: "0.75rem",
    width: "100%",
  },
});
