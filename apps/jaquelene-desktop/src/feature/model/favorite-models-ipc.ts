import { FavoriteModels as FavoriteModelsIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { FavoriteModels } from "./favorite-models";

export function exposeFavoriteModels(target: WebFrameMain, favoriteModels: FavoriteModels) {
  FavoriteModelsIpc.for(target).setImplementation({
    list: favoriteModels.list,
    set: favoriteModels.set,
  });
}
