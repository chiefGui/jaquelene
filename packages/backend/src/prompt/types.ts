import type {
  CreatePromptInput,
  CustomPrompt,
  Prompt,
  PromptBody,
  PromptKey,
  PromptKindKey,
  PromptTitle,
  UpdatePromptInput,
} from "@jaquelene/domain";
import type { CampaignId } from "#backend/id";

export type { BuiltInPrompt, CustomPrompt, Prompt } from "@jaquelene/domain";

export type PromptKind = Readonly<{
  key: PromptKindKey;
  name: string;
  description: string;
}>;

export type BuiltInPromptDefinition = Readonly<{
  key: PromptKey;
  title: PromptTitle;
  body: PromptBody;
}>;

export type PromptKindRegistration = Readonly<{
  definition: PromptKind;
  builtInPrompts: readonly BuiltInPromptDefinition[];
  fallbackPromptKey?: PromptKey;
}>;

export type PromptPageRequest = Readonly<{
  kind: PromptKindKey;
  cursor?: string;
}>;

export type PromptPage = Readonly<{
  prompts: readonly Prompt[];
  nextCursor?: string;
}>;

export type PromptDefault = Readonly<{
  kind: PromptKindKey;
  promptKey: PromptKey | null;
  source: "override" | "fallback" | "none";
}>;

export type CampaignPromptSelection = Readonly<{
  campaignId: CampaignId;
  kind: PromptKindKey;
  selectedPromptKey?: PromptKey;
  effectivePromptKey: PromptKey | null;
  source: "campaign" | "default" | "fallback" | "none";
}>;

export type SetCampaignPromptSelectionInput = Readonly<{
  campaignId: CampaignId;
  kind: PromptKindKey;
  promptKey?: PromptKey;
}>;

export type PromptDeletion = Readonly<{
  kind: PromptKindKey;
}>;

export type PromptCatalog = Readonly<{
  listKinds: () => readonly PromptKind[];
  list: (request: PromptPageRequest) => PromptPage;
  get: (key: PromptKey) => Prompt | null;
}>;

export type PromptManagement = Readonly<{
  create: (input: CreatePromptInput) => CustomPrompt;
  update: (key: PromptKey, input: UpdatePromptInput) => CustomPrompt | null;
  delete: (key: PromptKey) => PromptDeletion | null;
  getDefault: (kind: PromptKindKey) => PromptDefault;
  setDefault: (kind: PromptKindKey, promptKey?: PromptKey) => PromptDefault;
  getCampaignSelection: (
    campaignId: CampaignId,
    kind: PromptKindKey,
  ) => CampaignPromptSelection | null;
  setCampaignSelection: (input: SetCampaignPromptSelectionInput) => CampaignPromptSelection | null;
}>;

export type Prompts = PromptCatalog & PromptManagement;
