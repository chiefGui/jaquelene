import { ErrorSeverity } from "@jaquelene/diagnostics";
import { ModelCatalog, type ModelCatalogSnapshot } from "@jaquelene/ipc/renderer";
import type { QueryClient } from "@tanstack/react-query";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { requireIpcMethod } from "@/ipc";
import { modelsForProviderQuery, observeModelCatalogRevision } from "./catalog-query";

const onModelsChanged = requireIpcMethod(ModelCatalog?.onModelsChanged);

export function installModelCatalogEvents(queryClient: QueryClient) {
  return onModelsChanged((providerId, revision) => {
    const observed = observeModelCatalogRevision(providerId, revision);

    if (revision <= observed) {
      return;
    }
    const query = modelsForProviderQuery(providerId);
    const current = queryClient.getQueryData<ModelCatalogSnapshot>(query.queryKey);

    if (current && current.revision >= revision) {
      return;
    }

    void queryClient
      .invalidateQueries({ queryKey: query.queryKey, exact: true })
      .catch((error: unknown) =>
        reportError("model.catalog.synchronize", error, ErrorSeverity.Warning),
      );
  });
}
