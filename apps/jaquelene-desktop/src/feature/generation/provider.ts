import type { GenerationId, ThreadId } from "@/id";

export type GenerationMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerationUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type GenerationProviderRequest = {
  generationId: GenerationId;
  threadId: ThreadId;
  modelId: string;
  messages: readonly GenerationMessage[];
  signal?: AbortSignal;
};

export type GenerationProviderResult = {
  text: string;
  providerGenerationId?: string;
  resolvedModelId?: string;
  finishReason?: string;
  usage?: GenerationUsage;
};

export type GenerationProvider = {
  id: string;
  generate(request: GenerationProviderRequest): Promise<GenerationProviderResult>;
};
