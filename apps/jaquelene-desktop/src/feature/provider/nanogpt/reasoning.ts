import {
  reasoningEfforts,
  requireModelReasoningCapability,
  type ModelReasoningCapability,
  type ReasoningEffort,
  type ReasoningPreset,
  type ResolvedReasoning,
} from "@jaquelene/backend";

export type NanoGptReasoningEffort = ReasoningEffort | "none";

function requireReasoningEffort(modelId: string, candidate: unknown): NanoGptReasoningEffort {
  if (
    candidate === "none" ||
    (typeof candidate === "string" && (reasoningEfforts as readonly string[]).includes(candidate))
  ) {
    return candidate as NanoGptReasoningEffort;
  }

  throw new TypeError(`NanoGPT model "${modelId}" has an invalid reasoning effort.`);
}

export function normalizeNanoGptReasoning(
  modelId: string,
  capable: unknown,
  reportedEfforts: unknown,
): ModelReasoningCapability | undefined {
  if (capable !== undefined && typeof capable !== "boolean") {
    throw new TypeError(`NanoGPT model "${modelId}" has an invalid reasoning capability.`);
  }

  if (reportedEfforts !== undefined && !Array.isArray(reportedEfforts)) {
    throw new TypeError(`NanoGPT model "${modelId}" has invalid reasoning efforts.`);
  }

  if (capable !== true && reportedEfforts !== undefined) {
    throw new TypeError(`NanoGPT model "${modelId}" reports contradictory reasoning metadata.`);
  }

  if (capable !== true) {
    return undefined;
  }

  const supportedPresets: ReasoningPreset[] = ["automatic"];

  for (const candidate of reportedEfforts ?? []) {
    const effort = requireReasoningEffort(modelId, candidate);

    if (effort === "none") {
      supportedPresets.push("off");
    } else {
      supportedPresets.push(effort);
    }
  }

  return requireModelReasoningCapability(
    { defaultPreset: "automatic", supportedPresets },
    `NanoGPT model "${modelId}" reasoning`,
  );
}

export function encodeNanoGptReasoning(
  reasoning: ResolvedReasoning | undefined,
): NanoGptReasoningEffort | undefined {
  if (!reasoning || reasoning.source === "model-default" || reasoning.preset === "automatic") {
    return undefined;
  }

  switch (reasoning.preset) {
    case "off":
      return "none";
    case "max":
    case "xhigh":
    case "high":
    case "medium":
    case "low":
    case "minimal":
      return reasoning.preset;
    case "on":
      throw new RangeError('NanoGPT does not support the binary reasoning preset "on".');
  }
}
