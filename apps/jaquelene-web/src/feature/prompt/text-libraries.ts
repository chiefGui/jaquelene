import { scenarioPromptKindKey } from "@jaquelene/domain";
import { ScenarioIcon } from "@/primitive/icons";

export const scenarioLibrary = {
  kind: scenarioPromptKindKey,
  label: "Scenario",
  noun: "scenario",
  plural: "Scenarios",
  pluralNoun: "scenarios",
  icon: ScenarioIcon,
  indexPath: "/library/scenarios",
  newPath: "/library/scenarios/new",
  editPath: "/library/scenarios/$promptKey/edit",
  contentDescription: "The setting, universe, and permanent details to copy into a campaign.",
} as const;

export const textLibraries = [scenarioLibrary] as const;
export type TextLibrary = (typeof textLibraries)[number];
