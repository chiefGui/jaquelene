import type { RequestedModelConfiguration as ComposedModelConfiguration } from "@jaquelene/domain";
import { requireReasoningPreset, type ReasoningPreset } from "#backend/model/reasoning";
import {
  requireModelReference,
  requireModelSelection,
  type ModelReference,
  type ModelSelection,
} from "#backend/provider/provider";

export type RequestedModelConfiguration = ComposedModelConfiguration<
  ModelReference,
  ReasoningPreset
>;

export function requireRequestedModelConfiguration(configuration: RequestedModelConfiguration) {
  requireModelReference(configuration.model);

  if (configuration.reasoningPreset !== undefined) {
    requireReasoningPreset(configuration.reasoningPreset);
  }
}

export type ModelConfigurationSelection = ComposedModelConfiguration<
  ModelSelection,
  ReasoningPreset
>;

export function requireModelConfigurationSelection(configuration: ModelConfigurationSelection) {
  requireModelSelection(configuration.model);

  if (configuration.reasoningPreset !== undefined) {
    requireReasoningPreset(configuration.reasoningPreset);
  }
}
