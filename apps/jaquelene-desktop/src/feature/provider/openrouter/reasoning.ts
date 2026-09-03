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

// OpenRouter translates these gateway efforts into percentages of the available
// reasoning budget. "xhigh" is intentionally omitted because it is equivalent
// to "max" for budget-backed models.
const budgetBackedEfforts = [
  "max",
  "high",
  "medium",
  "low",
  "minimal",
] as const satisfies readonly ReasoningEffort[];

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

function requireReasoningEffort(
  candidate: unknown,
  field: "default" | "supported",
  modelId: string,
): ReasoningEffort {
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
  const supportsMaxTokens = requireOptionalBoolean(
    metadata.supportsMaxTokens,
    "token-budget support",
    modelId,
  );

  if (mandatory && defaultEnabled === false) {
    throw new TypeError(
      `OpenRouter model "${modelId}" cannot require reasoning while disabling it by default.`,
    );
  }

  const reportedDefaultEffort = metadata.defaultEffort;
  let reportedDefaultPreset: ReasoningEffort | undefined;

  // OpenRouter uses a default "none" to mean no effort argument, not disabled reasoning.
  if (
    reportedDefaultEffort !== undefined &&
    reportedDefaultEffort !== null &&
    reportedDefaultEffort !== "none"
  ) {
    reportedDefaultPreset = requireReasoningEffort(reportedDefaultEffort, "default", modelId);
  }

  const reportedSupportedEfforts = metadata.supportedEfforts;

  if (reportedSupportedEfforts === undefined) {
    if (supportsMaxTokens) {
      const supportedPresets: ReasoningPreset[] = [...budgetBackedEfforts];

      if (!mandatory) {
        supportedPresets.push("off");
      }

      let defaultPreset: ReasoningPreset;

      if (!mandatory && defaultEnabled === false) {
        defaultPreset = "off";
      } else if (!mandatory && defaultEnabled === undefined) {
        defaultPreset = "automatic";
        supportedPresets.unshift("automatic");
      } else if (reportedDefaultPreset !== undefined) {
        defaultPreset = reportedDefaultPreset;

        if (reportedDefaultPreset === "xhigh") {
          defaultPreset = "max";
        }
      } else if (defaultEnabled === true) {
        // OpenRouter defines enabled reasoning without an effort as medium.
        defaultPreset = "medium";
      } else {
        defaultPreset = "automatic";
        supportedPresets.unshift("automatic");
      }

      return requireModelReasoningCapability({ defaultPreset, supportedPresets }, description);
    }

    if (mandatory) {
      return requireModelReasoningCapability(
        { defaultPreset: "on", supportedPresets: ["on"] },
        description,
      );
    }

    let defaultPreset: ReasoningPreset = "automatic";
    let supportedPresets: ReasoningPreset[] = ["automatic", "on", "off"];

    if (defaultEnabled === true) {
      defaultPreset = "on";
      supportedPresets = ["on", "off"];
    } else if (defaultEnabled === false) {
      defaultPreset = "off";
      supportedPresets = ["on", "off"];
    }

    return requireModelReasoningCapability({ defaultPreset, supportedPresets }, description);
  }

  let supportedEfforts: readonly unknown[];

  if (reportedSupportedEfforts === null) {
    supportedEfforts = reasoningEfforts;
  } else if (Array.isArray(reportedSupportedEfforts)) {
    supportedEfforts = reportedSupportedEfforts;
  } else {
    throw new TypeError(`OpenRouter model "${modelId}" reasoning has invalid supported efforts.`);
  }

  if (supportedEfforts.length === 0) {
    throw new TypeError(
      `OpenRouter model "${modelId}" reasoning must expose at least one supported effort.`,
    );
  }

  const supportedPresets: ReasoningPreset[] = supportedEfforts.map((effort) => {
    if (effort === "none") {
      return "off";
    }

    return requireReasoningEffort(effort, "supported", modelId);
  });

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

  if (!mandatory && defaultEnabled === false) {
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
