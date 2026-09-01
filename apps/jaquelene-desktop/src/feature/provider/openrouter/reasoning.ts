import {
  reasoningEfforts,
  requireModelReasoningCapability,
  type ModelReasoningCapability,
  type ReasoningEffort,
  type ReasoningPreset,
  type ResolvedReasoning,
} from "@jaquelene/backend";

export type OpenRouterReasoningMetadata = Readonly<{
  defaultEffort?: unknown;
  defaultEnabled?: unknown;
  mandatory: unknown;
  supportedEfforts?: unknown;
  supportsMaxTokens?: unknown;
}>;

export type OpenRouterReasoningRequest =
  | Readonly<{ enabled: true }>
  | Readonly<{ effort: ReasoningEffort | "none" }>;

function requireOptionalBoolean(
  value: unknown,
  field: string,
  modelId: string,
): boolean | undefined {
  if (value !== undefined && typeof value !== "boolean") {
    throw new TypeError(`OpenRouter model "${modelId}" has invalid reasoning ${field}.`);
  }

  return value;
}

function toPreset(
  candidate: unknown,
  field: "default" | "supported",
  modelId: string,
): ReasoningEffort | "off" {
  if (candidate === "none") {
    return "off";
  }

  if (
    typeof candidate === "string" &&
    (reasoningEfforts as readonly string[]).includes(candidate)
  ) {
    return candidate as ReasoningEffort;
  }

  throw new TypeError(`OpenRouter model "${modelId}" reasoning has an invalid ${field} effort.`);
}

export function normalizeOpenRouterReasoning(
  modelId: string,
  metadata: OpenRouterReasoningMetadata | undefined,
): ModelReasoningCapability | undefined {
  if (!metadata) {
    return undefined;
  }

  const description = `OpenRouter model "${modelId}" reasoning`;

  if (typeof metadata.mandatory !== "boolean") {
    throw new TypeError(`OpenRouter model "${modelId}" has invalid reasoning mandatory state.`);
  }

  const mandatory = metadata.mandatory;
  const defaultEnabled = requireOptionalBoolean(
    metadata.defaultEnabled,
    "default-enabled state",
    modelId,
  );
  requireOptionalBoolean(metadata.supportsMaxTokens, "token-budget support", modelId);

  if (mandatory && defaultEnabled === false) {
    throw new TypeError(
      `OpenRouter model "${modelId}" cannot require reasoning while disabling it by default.`,
    );
  }

  const reportedDefaultEffort = metadata.defaultEffort;
  const reportedDefaultPreset =
    reportedDefaultEffort === undefined || reportedDefaultEffort === null
      ? undefined
      : toPreset(reportedDefaultEffort, "default", modelId);

  if (mandatory && reportedDefaultPreset === "off") {
    throw new TypeError(
      `OpenRouter model "${modelId}" requires reasoning and cannot default to "none".`,
    );
  }

  if (defaultEnabled === true && reportedDefaultPreset === "off") {
    throw new TypeError(
      `OpenRouter model "${modelId}" cannot enable reasoning while defaulting its effort to "none".`,
    );
  }

  const reportedSupportedEfforts = metadata.supportedEfforts;

  if (reportedSupportedEfforts === undefined) {
    if (mandatory) {
      return requireModelReasoningCapability(
        { defaultPreset: "on", supportedPresets: ["on"] },
        description,
      );
    }

    const defaultPreset =
      defaultEnabled === true
        ? "on"
        : defaultEnabled === false || reportedDefaultPreset === "off"
          ? "off"
          : "automatic";
    return requireModelReasoningCapability(
      {
        defaultPreset,
        supportedPresets:
          defaultPreset === "automatic" ? ["automatic", "on", "off"] : ["on", "off"],
      },
      description,
    );
  }

  if (reportedSupportedEfforts !== null && !Array.isArray(reportedSupportedEfforts)) {
    throw new TypeError(`OpenRouter model "${modelId}" reasoning has invalid supported efforts.`);
  }

  const supportedEfforts =
    reportedSupportedEfforts === null ? reasoningEfforts : reportedSupportedEfforts;

  if (supportedEfforts.length === 0) {
    throw new TypeError(
      `OpenRouter model "${modelId}" reasoning must expose at least one supported effort.`,
    );
  }

  const supportedPresets: ReasoningPreset[] = supportedEfforts.map((effort) =>
    toPreset(effort, "supported", modelId),
  );

  if (mandatory && supportedPresets.includes("off")) {
    throw new TypeError(
      `OpenRouter model "${modelId}" requires reasoning and cannot support "none".`,
    );
  }

  if (!mandatory && !supportedPresets.includes("off")) {
    supportedPresets.push("off");
  }

  if (reportedDefaultPreset !== undefined && !supportedPresets.includes(reportedDefaultPreset)) {
    throw new TypeError(
      `OpenRouter model "${modelId}" reasoning has a default effort that is not supported.`,
    );
  }

  let defaultPreset: ReasoningPreset;

  if (!mandatory && (defaultEnabled === false || reportedDefaultPreset === "off")) {
    defaultPreset = "off";
  } else if (!mandatory && defaultEnabled === undefined) {
    defaultPreset = "automatic";
    supportedPresets.unshift("automatic");
  } else if (reportedDefaultPreset === undefined) {
    defaultPreset = "automatic";
    supportedPresets.unshift("automatic");
  } else {
    defaultPreset = reportedDefaultPreset;
  }

  return requireModelReasoningCapability({ defaultPreset, supportedPresets }, description);
}

export function encodeOpenRouterReasoning(
  reasoning: ResolvedReasoning | undefined,
): OpenRouterReasoningRequest | undefined {
  if (!reasoning || reasoning.source === "model-default") {
    return undefined;
  }

  switch (reasoning.preset) {
    case "automatic":
      return undefined;
    case "on":
      return { enabled: true };
    case "off":
      return { effort: "none" };
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return { effort: reasoning.preset };
  }
}
