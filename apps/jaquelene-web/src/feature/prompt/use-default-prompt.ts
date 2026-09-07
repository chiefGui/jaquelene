import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { promptDefaultQuery, promptQuery } from "@/feature/prompt/query";

export function useDefaultPrompt(kind: string) {
  const { data: selection } = useSuspenseQuery(promptDefaultQuery(kind));
  const queries = [];
  if (selection.promptKey) queries.push(promptQuery(selection.promptKey));
  const results = useSuspenseQueries({ queries });
  const prompt = results[0]?.data;
  if (selection.promptKey && (!prompt || prompt.kind !== kind)) {
    throw new Error("The default library entry is unavailable.");
  }
  return prompt ?? null;
}
