import {
  UserInterfacePreferences,
  type UserInterfacePreferenceValues,
} from "@jaquelene/ipc/renderer";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

const getPreferences = requireIpcMethod(UserInterfacePreferences?.get);
const setTheme = requireIpcMethod(UserInterfacePreferences?.setTheme);
const setFont = requireIpcMethod(UserInterfacePreferences?.setFont);
const setScale = requireIpcMethod(UserInterfacePreferences?.setScale);
const setMotion = requireIpcMethod(UserInterfacePreferences?.setMotion);

export const userInterfacePreferencesQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["preferences", "appearance", "user-interface"],
  queryFn: getPreferences,
});

function useSetPreference<Key extends keyof UserInterfacePreferenceValues>(
  key: Key,
  setValue: (value: UserInterfacePreferenceValues[Key]) => Promise<UserInterfacePreferenceValues>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    ...ipcMutationOptions,
    mutationKey: [...userInterfacePreferencesQuery.queryKey, key],
    scope: { id: "user-interface-preferences" },
    mutationFn: setValue,
    async onMutate(value) {
      await queryClient.cancelQueries({
        queryKey: userInterfacePreferencesQuery.queryKey,
        exact: true,
      });
      const previous = queryClient.getQueryData(userInterfacePreferencesQuery.queryKey);

      if (!previous) {
        throw new Error("User interface preferences are unavailable.");
      }

      queryClient.setQueryData(userInterfacePreferencesQuery.queryKey, {
        ...previous,
        [key]: value,
      });
      return { previous };
    },
    onError(_error, _value, context) {
      if (context) {
        queryClient.setQueryData(userInterfacePreferencesQuery.queryKey, context.previous);
      }
    },
    onSuccess(values) {
      queryClient.setQueryData(userInterfacePreferencesQuery.queryKey, values);
    },
  });
}

export function useSetUiTheme() {
  return useSetPreference("theme", setTheme);
}

export function useSetUiFont() {
  return useSetPreference("font", setFont);
}

export function useSetInterfaceScale() {
  return useSetPreference("scale", setScale);
}

export function useSetMotion() {
  return useSetPreference("motion", setMotion);
}
