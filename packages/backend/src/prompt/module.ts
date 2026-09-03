import type { PromptApplication } from "./application-registry";
import type { PromptEngine } from "./prompts";
import type { PromptKindRegistration } from "./types";

export type PromptKindModule = PromptKindRegistration &
  Readonly<{
    createApplication: (
      prompts: Pick<PromptEngine, "resolveCampaignPrompt">,
    ) => Pick<PromptApplication, "apply">;
  }>;
