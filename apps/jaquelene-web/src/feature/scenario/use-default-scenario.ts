import { scenarioPromptKindKey } from "@jaquelene/domain";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { promptDefaultQuery, promptQuery } from "@/feature/prompt/query";

export function useDefaultScenario() {
  const { data: selection } = useSuspenseQuery(promptDefaultQuery(scenarioPromptKindKey));
  const queries = [];
  if (selection.promptKey) queries.push(promptQuery(selection.promptKey));
  const results = useSuspenseQueries({ queries });
  const prompt = results[0]?.data;
  if (selection.promptKey && (!prompt || prompt.kind !== scenarioPromptKindKey)) {
    throw new Error("The default scenario is unavailable.");
  }
  return prompt ?? null;
}
