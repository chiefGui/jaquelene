import type {
  CreateSkillInput,
  CustomSkill,
  Skill,
  Prompt,
  SkillKey,
  SkillKindKey,
  SkillTitle,
  UpdateSkillInput,
} from "@jaquelene/domain";

export type { BuiltInSkill, CustomSkill, Skill } from "@jaquelene/domain";

export type SkillKind = Readonly<{
  key: SkillKindKey;
  name: string;
  description: string;
}>;

export type BuiltInSkillDefinition = Readonly<{
  key: SkillKey;
  title: SkillTitle;
  prompt: Prompt;
}>;

export type SkillKindRegistration = Readonly<{
  definition: SkillKind;
  builtInSkills: readonly BuiltInSkillDefinition[];
  fallbackSkillKey?: SkillKey;
}>;

export type SkillPageRequest = Readonly<{
  kind: SkillKindKey;
  cursor?: string;
}>;

export type SkillPage = Readonly<{
  skills: readonly Skill[];
  nextCursor?: string;
}>;

export type SkillDefault = Readonly<{
  kind: SkillKindKey;
  skillKey: SkillKey | null;
  source: "override" | "fallback" | "none";
}>;

export type SkillDeletion = Readonly<{
  kind: SkillKindKey;
}>;

export type SkillCatalog = Readonly<{
  getKind: (kind: SkillKindKey) => SkillKind | null;
  listKinds: () => readonly SkillKind[];
  list: (request: SkillPageRequest) => SkillPage;
  get: (key: SkillKey) => Skill | null;
  resolveDefault: (kind: SkillKindKey) => Skill | null;
  getDefault: (kind: SkillKindKey) => SkillDefault;
}>;

export type SkillManagement = Readonly<{
  create: (input: CreateSkillInput) => CustomSkill;
  update: (key: SkillKey, input: UpdateSkillInput) => CustomSkill | null;
  delete: (key: SkillKey) => SkillDeletion | null;
  setDefault: (kind: SkillKindKey, skillKey?: SkillKey) => SkillDefault;
}>;

export type Skills = SkillCatalog & SkillManagement;
