import {
  MarkdownEditorPreferences,
  type MarkdownEditorPreferenceValues,
} from "@jaquelene/ipc/renderer";
import {
  mutationOptions,
  queryOptions,
  useIsMutating,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { reportError } from "@/feature/diagnostics/diagnostics";
import {
  appDataStorageMeta,
  storageDeletion,
  dispatchStorageWrite,
} from "@/feature/storage/lifecycle";
import { ipcMutationOptions, ipcQueryOptions, requireIpcMethod } from "@/ipc";

type Values = MarkdownEditorPreferenceValues;

const mutationKey = ["preferences", "markdown-editor", "set"] as const;
const getPreferences = requireIpcMethod(MarkdownEditorPreferences?.get);
const setters: { [Key in keyof Values]: (value: Values[Key]) => Promise<Values[Key]> } = {
  maxRows: requireIpcMethod(MarkdownEditorPreferences?.setMaxRows),
  showLineCount: requireIpcMethod(MarkdownEditorPreferences?.setShowLineCount),
  showWordCount: requireIpcMethod(MarkdownEditorPreferences?.setShowWordCount),
  showCharacterCount: requireIpcMethod(MarkdownEditorPreferences?.setShowCharacterCount),
  showEstimatedTokens: requireIpcMethod(MarkdownEditorPreferences?.setShowEstimatedTokens),
};

export const markdownEditorPreferencesQuery = queryOptions({
  meta: appDataStorageMeta,
  ...ipcQueryOptions,
  queryKey: ["preferences", "markdown-editor"],
  queryFn: getPreferences,
});

function requirePreferences(queryClient: QueryClient) {
  const values = queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey);
  if (!values) {
    throw new Error("Markdown editor preferences are unavailable.");
  }
  return values;
}

function updateField<Key extends keyof Values>(
  queryClient: QueryClient,
  key: Key,
  value: Values[Key],
) {
  queryClient.setQueryData(markdownEditorPreferencesQuery.queryKey, (previous) => {
    if (!previous) {
      throw new Error("Markdown editor preferences are unavailable.");
    }
    return { ...previous, [key]: value };
  });
}

export function markdownEditorPreferenceMutationOptions<Key extends keyof Values>(
  queryClient: QueryClient,
  key: Key,
) {
  const setValue: (value: Values[Key]) => Promise<Values[Key]> = setters[key];
  return mutationOptions({
    meta: appDataStorageMeta,
    ...ipcMutationOptions,
    mutationKey: [...mutationKey, key],
    mutationFn: setValue,
    async onMutate(value: Values[Key]) {
      await queryClient.cancelQueries({
        queryKey: markdownEditorPreferencesQuery.queryKey,
        exact: true,
      });
      const previous = requirePreferences(queryClient)[key];
      updateField(queryClient, key, value);
      return { previous };
    },
    onSuccess(value) {
      updateField(queryClient, key, value);
    },
    onError(error, _value, context) {
      if (context) {
        updateField(queryClient, key, context.previous);
      }
      reportError(`markdown-editor.preferences.${key}`, error);
    },
  });
}

export function useSetMarkdownEditorPreference<Key extends keyof Values>(key: Key) {
  const queryClient = useQueryClient();
  const options = markdownEditorPreferenceMutationOptions(queryClient, key);
  const mutation = useMutation(options);
  const pending = useIsMutating({ mutationKey: options.mutationKey, exact: true }) > 0;
  const resetting = useIsMutating(storageDeletion(appDataStorageMeta.storageCategory)) > 0;

  return {
    pending: pending || resetting,
    error: mutation.isError,
    setValue(value: Values[Key]) {
      dispatchStorageWrite(
        queryClient,
        appDataStorageMeta.storageCategory,
        options.mutationKey,
        () => mutation.mutate(value),
      );
    },
  };
}
