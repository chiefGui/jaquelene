import { scenarioPromptKindKey, openingScenePromptKindKey } from "@jaquelene/domain";
import { ScenarioIcon, OpeningSceneIcon } from "@/primitive/icons";

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
  description: "The setting, universe, flavor, and permanent details of a campaign.",
} as const;

export const openingSceneLibrary = {
  kind: openingScenePromptKindKey,
  label: "Opening scene",
  noun: "opening scene",
  plural: "Opening scenes",
  pluralNoun: "opening scenes",
  icon: OpeningSceneIcon,
  indexPath: "/library/opening-scenes",
  newPath: "/library/opening-scenes/new",
  editPath: "/library/opening-scenes/$promptKey/edit",
  description: "The first message you will respond to when the campaign starts.",
} as const;

export const textLibraries = [scenarioLibrary, openingSceneLibrary] as const;
export type TextLibrary = (typeof textLibraries)[number];
