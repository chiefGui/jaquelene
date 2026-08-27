import { ModelCatalog as ModelCatalogIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { ModelCatalog } from "./catalog";

export function exposeModelCatalog(target: WebFrameMain, catalog: ModelCatalog) {
  ModelCatalogIpc.for(target).setImplementation({
    listProviders: catalog.listProviders,
    listModels: catalog.listModels,
  });
}
