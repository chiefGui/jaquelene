import type { GenerationCostSource } from "#backend/provider/provider";

export type UsageCoverage = Readonly<{
  reported: number;
  unknown: number;
}>;

export type TokenUsage = Readonly<{
  input: number;
  output: number;
  total: number;
  cacheReadInput?: number;
  cacheWriteInput?: number;
  reasoningOutput?: number;
}>;

export type CostUsage = Readonly<{
  currency: string;
  source: GenerationCostSource;
  amountNanos: number;
  attempts: number;
}>;
