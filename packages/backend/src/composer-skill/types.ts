import type { Skill } from "#backend/skill/skill";
import type { ResolvedModelConfiguration } from "#backend/model/execution";
import type { UsageAttribution } from "#backend/usage/types";
import type { RecentHistory, RecentHistoryOptions } from "#backend/thread/history";

export type ComposerSkillInput = Readonly<{
  executionId: string;
  configuration: ResolvedModelConfiguration;
  context: Readonly<{ history: RecentHistory; scenario: string }>;
  attribution: UsageAttribution;
}>;

export type ComposerSkill = Skill<ComposerSkillInput, string> &
  Readonly<{
    history: RecentHistoryOptions;
  }>;
