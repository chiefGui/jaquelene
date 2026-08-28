import {
  InterfaceScale,
  UserInterfacePreferences,
  UiFont,
  type UserInterfacePreferenceValues,
} from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getPreferences = requireIpcMethod(UserInterfacePreferences?.get);
const setFont = requireIpcMethod(UserInterfacePreferences?.setFont);
const setScale = requireIpcMethod(UserInterfacePreferences?.setScale);

export const userInterfacePreferencesQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "appearance", "user-interface"],
  queryFn: getPreferences,
});

function useSetPreference<Value>(
  setValue: (value: Value) => Promise<UserInterfacePreferenceValues>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationFn: setValue,
    onMutate: () =>
      queryClient.cancelQueries({ queryKey: userInterfacePreferencesQuery.queryKey, exact: true }),
    onSuccess(values) {
      queryClient.setQueryData(userInterfacePreferencesQuery.queryKey, values);
    },
  });
}

export function useSetUiFont() {
  return useSetPreference<UiFont>(setFont);
}

export function useSetInterfaceScale() {
  return useSetPreference<InterfaceScale>(setScale);
}
