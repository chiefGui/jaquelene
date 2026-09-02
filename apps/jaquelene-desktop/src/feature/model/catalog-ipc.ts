import {
  ModelCatalogFailureKind,
  ModelCatalogFreshness,
  ModelCatalogRefreshState,
  ModelCatalog as ModelCatalogIpc,
  type AvailableModel as IpcAvailableModel,
  type ModelCatalogSnapshot as IpcModelCatalogSnapshot,
} from "@jaquelene/ipc/main";
import type { WebContents } from "electron";
import type { ModelCatalog } from "./catalog";
import { toIpcReasoningPreset } from "./reasoning-preset";

type CatalogModel = Awaited<ReturnType<ModelCatalog["getModels"]>>["models"][number];

function toIpcModel(model: CatalogModel): IpcAvailableModel {
  const { reasoning, ...modelSnapshot } = model;
  return {
    ...modelSnapshot,
    ...(reasoning
      ? {
          reasoning: {
            defaultPreset: toIpcReasoningPreset(reasoning.defaultPreset),
            supportedPresets: reasoning.supportedPresets.map(toIpcReasoningPreset),
          },
        }
      : {}),
  };
}

function toIpcSnapshot(
  snapshot: Awaited<ReturnType<ModelCatalog["getModels"]>>,
): IpcModelCatalogSnapshot {
  const refresh = (() => {
    switch (snapshot.refresh.state) {
      case "idle":
        return { state: ModelCatalogRefreshState.Idle };
      case "refreshing":
        return {
          state: ModelCatalogRefreshState.Refreshing,
          startedAt: snapshot.refresh.startedAt,
        };
      case "failed":
        return {
          state: ModelCatalogRefreshState.Failed,
          failedAt: snapshot.refresh.failedAt,
          retryAt: snapshot.refresh.retryAt,
          failureKind:
            snapshot.refresh.failureKind === "timeout"
              ? ModelCatalogFailureKind.Timeout
              : ModelCatalogFailureKind.Source,
        };
    }
  })();

  return {
    models: snapshot.models.map(toIpcModel),
    revision: snapshot.revision,
    freshness:
      snapshot.freshness === "fresh" ? ModelCatalogFreshness.Fresh : ModelCatalogFreshness.Stale,
    updatedAt: snapshot.updatedAt,
    discardAt: snapshot.discardAt,
    refresh,
  };
}

export function exposeModelCatalog(target: WebContents, catalog: ModelCatalog) {
  const dispatcher = ModelCatalogIpc.for(target.mainFrame).setImplementation({
    listProviders: () => [...catalog.listProviders()],
    getModels: async (providerId) => toIpcSnapshot(await catalog.getModels(providerId)),
    refreshModels: async (providerId) => toIpcSnapshot(await catalog.refreshModels(providerId)),
  });
  const unsubscribeCatalog = catalog.subscribe((providerId, revision) => {
    if (!target.isDestroyed()) {
      dispatcher.dispatchModelsChanged(providerId, revision);
    }
  });
  let installed = true;
  const dispose = () => {
    if (!installed) {
      return;
    }

    installed = false;
    target.off("destroyed", dispose);
    unsubscribeCatalog();
  };
  target.once("destroyed", dispose);
  return dispose;
}
