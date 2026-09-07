import { PromptOrigin, promptKeySchema } from "@jaquelene/domain";
import type { QueryClient } from "@tanstack/react-query";
import { promptDefaultQuery, promptKindsQuery, promptPagesQuery, promptQuery } from "./query";
import type { TextLibrary } from "./text-libraries";

export async function loadTextLibrary(queryClient: QueryClient, library: TextLibrary) {
  await Promise.all([
    queryClient.query(promptKindsQuery),
    queryClient.query(promptDefaultQuery(library.kind)),
    queryClient.infiniteQuery(promptPagesQuery(library.kind)),
  ]);
}

export async function loadTextLibraryPrompt(
  queryClient: QueryClient,
  library: TextLibrary,
  value: string,
) {
  const key = promptKeySchema.safeParse(value);
  if (!key.success) return null;
  const prompt = await queryClient.query(promptQuery(key.data));
  if (prompt?.kind !== library.kind || prompt.origin !== PromptOrigin.Custom) return null;
  await queryClient.query(promptDefaultQuery(library.kind));
  return String(prompt.key);
}
