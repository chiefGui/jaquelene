import {
  MarkdownEditorMaxRows,
  type MarkdownEditorPreferenceValues,
} from "@jaquelene/ipc/renderer";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const ipc = vi.hoisted(() => ({
  get: vi.fn(),
  setMaxRows: vi.fn(),
  setShowLineCount: vi.fn(),
  setShowWordCount: vi.fn(),
  setShowCharacterCount: vi.fn(),
  setShowEstimatedTokens: vi.fn(),
}));
vi.mock("@jaquelene/ipc/renderer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@jaquelene/ipc/renderer")>()),
  MarkdownEditorPreferences: ipc,
}));
vi.mock("@/feature/diagnostics/diagnostics", () => ({ reportError: vi.fn() }));

import {
  markdownEditorPreferencesQuery,
  markdownEditorPreferenceMutationOptions,
} from "./preferences";
import { appDataStorageMeta, dispatchStorageWrite } from "@/feature/storage/lifecycle";

const initial: MarkdownEditorPreferenceValues = {
  maxRows: MarkdownEditorMaxRows.Five,
  showLineCount: true,
  showWordCount: true,
  showCharacterCount: true,
  showEstimatedTokens: true,
};
const clients: QueryClient[] = [];
function client() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(markdownEditorPreferencesQuery.queryKey, { ...initial });
  clients.push(queryClient);
  return queryClient;
}
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((resolveValue, rejectError) => {
    resolve = resolveValue;
    reject = rejectError;
  });
  return { promise, resolve, reject };
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  for (const queryClient of clients.splice(0)) queryClient.clear();
});

describe("Markdown editor preference updates", () => {
  it("shows a changed field immediately and reconciles its saved value", async () => {
    const queryClient = client();
    const save = deferred<MarkdownEditorMaxRows>();
    ipc.setMaxRows.mockReturnValue(save.promise);
    const mutation = new MutationObserver(
      queryClient,
      markdownEditorPreferenceMutationOptions(queryClient, "maxRows"),
    );
    const result = mutation.mutate(MarkdownEditorMaxRows.Eight);
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey)?.maxRows).toBe(
        MarkdownEditorMaxRows.Eight,
      ),
    );
    save.resolve(MarkdownEditorMaxRows.Eight);
    await result;
    expect(queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey)).toEqual({
      ...initial,
      maxRows: MarkdownEditorMaxRows.Eight,
    });
  });

  it.each(["line-first", "word-first"])(
    "preserves independent saves in %s completion order",
    async (order) => {
      const queryClient = client();
      const lineSave = deferred<boolean>();
      const wordSave = deferred<boolean>();
      ipc.setShowLineCount.mockReturnValue(lineSave.promise);
      ipc.setShowWordCount.mockReturnValue(wordSave.promise);
      const lines = new MutationObserver(
        queryClient,
        markdownEditorPreferenceMutationOptions(queryClient, "showLineCount"),
      );
      const words = new MutationObserver(
        queryClient,
        markdownEditorPreferenceMutationOptions(queryClient, "showWordCount"),
      );
      const lineResult = lines.mutate(false);
      const wordResult = words.mutate(false);
      await vi.waitFor(() =>
        expect(queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey)).toMatchObject({
          showLineCount: false,
          showWordCount: false,
        }),
      );
      if (order === "line-first") {
        lineSave.resolve(false);
        await lineResult;
        expect(
          queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey)?.showWordCount,
        ).toBe(false);
        wordSave.resolve(false);
      } else {
        wordSave.resolve(false);
        await wordResult;
        expect(
          queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey)?.showLineCount,
        ).toBe(false);
        lineSave.resolve(false);
      }
      await Promise.all([lineResult, wordResult]);
      expect(queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey)).toEqual({
        ...initial,
        showLineCount: false,
        showWordCount: false,
      });
    },
  );

  it.each(["failure-first", "success-first"])(
    "rolls back only the failed field in %s order",
    async (order) => {
      const queryClient = client();
      const lineSave = deferred<boolean>();
      const wordSave = deferred<boolean>();
      const failure = new Error("Could not save lines");
      ipc.setShowLineCount.mockReturnValue(lineSave.promise);
      ipc.setShowWordCount.mockReturnValue(wordSave.promise);
      const lines = new MutationObserver(
        queryClient,
        markdownEditorPreferenceMutationOptions(queryClient, "showLineCount"),
      );
      const words = new MutationObserver(
        queryClient,
        markdownEditorPreferenceMutationOptions(queryClient, "showWordCount"),
      );
      const lineResult = lines.mutate(false).catch((error: unknown) => error);
      const wordResult = words.mutate(false);
      await vi.waitFor(() =>
        expect(queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey)).toMatchObject({
          showLineCount: false,
          showWordCount: false,
        }),
      );
      if (order === "failure-first") {
        lineSave.reject(failure);
        await lineResult;
        expect(
          queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey)?.showWordCount,
        ).toBe(false);
        wordSave.resolve(false);
      } else {
        wordSave.resolve(false);
        await wordResult;
        lineSave.reject(failure);
      }
      expect(await lineResult).toBe(failure);
      await wordResult;
      expect(queryClient.getQueryData(markdownEditorPreferencesQuery.queryKey)).toEqual({
        ...initial,
        showWordCount: false,
      });
    },
  );

  it("rejects duplicate dispatch synchronously and allows the next save after settlement", async () => {
    const queryClient = client();
    const save = deferred<boolean>();
    ipc.setShowLineCount.mockReturnValue(save.promise);
    const options = markdownEditorPreferenceMutationOptions(queryClient, "showLineCount");
    const mutation = new MutationObserver(queryClient, options);
    let result: Promise<boolean> | undefined;
    const dispatch = () => {
      result = mutation.mutate(false);
    };
    expect(
      dispatchStorageWrite(
        queryClient,
        appDataStorageMeta.storageCategory,
        options.mutationKey,
        dispatch,
      ),
    ).toBe(true);
    expect(
      dispatchStorageWrite(
        queryClient,
        appDataStorageMeta.storageCategory,
        options.mutationKey,
        dispatch,
      ),
    ).toBe(false);
    save.resolve(false);
    await result;
    expect(ipc.setShowLineCount).toHaveBeenCalledOnce();
    expect(
      dispatchStorageWrite(
        queryClient,
        appDataStorageMeta.storageCategory,
        options.mutationKey,
        dispatch,
      ),
    ).toBe(true);
    await result;
    expect(ipc.setShowLineCount).toHaveBeenCalledTimes(2);
  });
});
