import type { GenerationConfiguration as ComposedGenerationConfiguration } from "@jaquelene/domain";
import { requireReasoningPreset, type ReasoningPreset } from "#backend/model/reasoning";
import {
  requireModelReference,
  requireModelSelection,
  type ModelReference,
  type ModelSelection,
} from "#backend/provider/provider";

export type GenerationConfiguration = ComposedGenerationConfiguration<
  ModelReference,
  ReasoningPreset
>;

export function requireGenerationConfiguration(configuration: GenerationConfiguration) {
  requireModelReference(configuration.model);

  if (configuration.reasoningPreset !== undefined) {
    requireReasoningPreset(configuration.reasoningPreset);
  }
}

export type GenerationConfigurationSelection = ComposedGenerationConfiguration<
  ModelSelection,
  ReasoningPreset
>;

export function requireGenerationConfigurationSelection(
  configuration: GenerationConfigurationSelection,
) {
  requireModelSelection(configuration.model);

  if (configuration.reasoningPreset !== undefined) {
    requireReasoningPreset(configuration.reasoningPreset);
  }
}
