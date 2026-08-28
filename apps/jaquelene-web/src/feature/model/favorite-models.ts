import { FavoriteModels, type ModelReference } from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const listFavoriteModels = requireIpcMethod(FavoriteModels?.list);
const setFavoriteModel = requireIpcMethod(FavoriteModels?.set);
const setFavoriteModelMutationKey = ["favorite-models", "set"] as const;

type SetFavoriteModelVariables = {
  favorite: boolean;
  reference: ModelReference;
};

type SetFavoriteModelContext = {
  previousIndex: number | undefined;
};

function sameModel(left: ModelReference, right: ModelReference) {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

function setFavoriteMembership(
  models: ModelReference[],
  reference: ModelReference,
  favorite: boolean,
  favoriteIndex = models.length,
) {
  const index = models.findIndex((candidate) => sameModel(candidate, reference));

  if ((favorite && index >= 0) || (!favorite && index < 0)) {
    return models;
  }

  if (!favorite) {
    return models.filter((_, candidateIndex) => candidateIndex !== index);
  }

  const nextModels = [...models];
  nextModels.splice(Math.min(favoriteIndex, nextModels.length), 0, { ...reference });
  return nextModels;
}

export const favoriteModelsQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["favorite-models"],
  queryFn: listFavoriteModels,
});

export function useSetFavoriteModel() {
  const queryClient = useQueryClient();

  return useMutation<ModelReference[], Error, SetFavoriteModelVariables, SetFavoriteModelContext>({
    ...ipcMutationOptions,
    mutationKey: setFavoriteModelMutationKey,
    scope: { id: "favorite-models" },
    mutationFn: ({ favorite, reference }) => setFavoriteModel(reference, favorite),
    async onMutate({ favorite, reference }) {
      const cancellation = queryClient.cancelQueries({
        queryKey: favoriteModelsQuery.queryKey,
        exact: true,
      });
      const models = queryClient.getQueryData<ModelReference[]>(favoriteModelsQuery.queryKey);
      const previousIndex = models?.findIndex((candidate) => sameModel(candidate, reference));

      if (models) {
        queryClient.setQueryData(
          favoriteModelsQuery.queryKey,
          setFavoriteMembership(models, reference, favorite),
        );
      }

      await cancellation;
      return { previousIndex };
    },
    onError(_error, { reference }, context) {
      const previousIndex = context?.previousIndex;

      if (previousIndex === undefined) {
        return;
      }

      queryClient.setQueryData<ModelReference[]>(favoriteModelsQuery.queryKey, (models) =>
        models
          ? setFavoriteMembership(models, reference, previousIndex >= 0, previousIndex)
          : models,
      );
    },
    onSettled(models) {
      if (queryClient.isMutating({ mutationKey: setFavoriteModelMutationKey, exact: true }) === 1) {
        if (models !== undefined) {
          queryClient.setQueryData(favoriteModelsQuery.queryKey, models);
          return;
        }

        return queryClient.invalidateQueries({
          queryKey: favoriteModelsQuery.queryKey,
          exact: true,
        });
      }
    },
  });
}

export function usePendingFavoriteModels() {
  return useMutationState<ModelReference>({
    filters: { mutationKey: setFavoriteModelMutationKey, status: "pending" },
    select: (mutation) => (mutation.state.variables as SetFavoriteModelVariables).reference,
  });
}
