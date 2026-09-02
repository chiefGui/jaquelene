import type {
  CreatePromptInput,
  PromptBody,
  PromptKey,
  PromptKindKey,
  PromptTitle,
  UpdatePromptInput,
} from "@jaquelene/domain";
import type { CampaignId } from "#backend/id";
import type { PromptOrigin } from "./schema";

export type PromptKind = Readonly<{
  key: PromptKindKey;
  name: string;
  description: string;
}>;

export type FactoryPromptDefinition = Readonly<{
  key: PromptKey;
  kind: PromptKindKey;
  origin: "factory";
  title: PromptTitle;
  body: PromptBody;
  createdAt: number;
}>;

export type PromptKindRegistration = Readonly<{
  definition: PromptKind;
  factoryPrompts: readonly FactoryPromptDefinition[];
  fallbackPromptKey?: PromptKey;
}>;

export type Prompt = Readonly<{
  key: PromptKey;
  kind: PromptKindKey;
  origin: PromptOrigin;
  title: PromptTitle;
  body: PromptBody;
  createdAt: number;
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
  create: (input: CreatePromptInput) => Prompt;
  update: (key: PromptKey, input: UpdatePromptInput) => Prompt | null;
  delete: (key: PromptKey) => PromptDeletion | null;
  getDefault: (kind: PromptKindKey) => PromptDefault;
  setDefault: (kind: PromptKindKey, promptKey: PromptKey) => PromptDefault;
  getCampaignSelection: (
    campaignId: CampaignId,
    kind: PromptKindKey,
  ) => CampaignPromptSelection | null;
  setCampaignSelection: (input: SetCampaignPromptSelectionInput) => CampaignPromptSelection | null;
}>;

export type Prompts = PromptCatalog & PromptManagement;
