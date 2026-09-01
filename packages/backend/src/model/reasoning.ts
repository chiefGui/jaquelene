export const reasoningEfforts = ["max", "xhigh", "high", "medium", "low", "minimal"] as const;

export type ReasoningEffort = (typeof reasoningEfforts)[number];

export const reasoningPresets = ["automatic", "on", ...reasoningEfforts, "off"] as const;

export type ReasoningPreset = (typeof reasoningPresets)[number];

export function requireReasoningPreset(preset: unknown): asserts preset is ReasoningPreset {
  if (typeof preset !== "string" || !(reasoningPresets as readonly string[]).includes(preset)) {
    throw new TypeError(`Unknown reasoning preset "${String(preset)}".`);
  }
}

export type ModelReasoningCapability = Readonly<{
  defaultPreset: ReasoningPreset;
  supportedPresets: readonly [ReasoningPreset, ...ReasoningPreset[]];
}>;

export function requireModelReasoningCapability(
  candidate: unknown,
  description = "A model reasoning capability",
): ModelReasoningCapability {
  if (typeof candidate !== "object" || candidate === null) {
    throw new TypeError(`${description} must be an object.`);
  }

  const capability = candidate as Partial<ModelReasoningCapability>;
  const candidateSupportedPresets = capability.supportedPresets;

  if (!Array.isArray(candidateSupportedPresets) || candidateSupportedPresets.length === 0) {
    throw new TypeError(`${description} must expose at least one supported preset.`);
  }

  const uniquePresets = new Set<ReasoningPreset>();

  for (const preset of candidateSupportedPresets) {
    try {
      requireReasoningPreset(preset);
    } catch {
      throw new TypeError(`${description} has an invalid supported preset.`);
    }

    if (uniquePresets.has(preset)) {
      throw new TypeError(`${description} repeats supported preset "${preset}".`);
    }

    uniquePresets.add(preset);
  }

  if (uniquePresets.size === 1 && uniquePresets.has("off")) {
    throw new TypeError(`${description} cannot support only disabled reasoning.`);
  }

  if (uniquePresets.has("on") && reasoningEfforts.some((preset) => uniquePresets.has(preset))) {
    throw new TypeError(`${description} cannot mix binary and graded reasoning presets.`);
  }

  try {
    requireReasoningPreset(capability.defaultPreset);
  } catch {
    throw new TypeError(`${description} has an invalid default preset.`);
  }

  if (!uniquePresets.has(capability.defaultPreset)) {
    throw new TypeError(`${description} has a default preset that is not supported.`);
  }

  return {
    defaultPreset: capability.defaultPreset,
    supportedPresets: reasoningPresets.filter((preset) => uniquePresets.has(preset)) as [
      ReasoningPreset,
      ...ReasoningPreset[],
    ],
  };
}

export const reasoningPresetSources = ["model-default", "override"] as const;

export type ReasoningPresetSource = (typeof reasoningPresetSources)[number];

export type ResolvedReasoning = Readonly<{
  preset: ReasoningPreset;
  source: ReasoningPresetSource;
}>;

export function requireResolvedReasoning(candidate: unknown): ResolvedReasoning {
  if (typeof candidate !== "object" || candidate === null) {
    throw new TypeError("A resolved reasoning configuration must be an object.");
  }

  const reasoning = candidate as Partial<ResolvedReasoning>;
  requireReasoningPreset(reasoning.preset);

  if (
    typeof reasoning.source !== "string" ||
    !(reasoningPresetSources as readonly string[]).includes(reasoning.source)
  ) {
    throw new TypeError(`Unknown reasoning preset source "${String(reasoning.source)}".`);
  }

  return { preset: reasoning.preset, source: reasoning.source };
}

export function resolveReasoning(
  capability: ModelReasoningCapability | undefined,
  override: ReasoningPreset | undefined,
): ResolvedReasoning | undefined {
  if (!capability) {
    if (override !== undefined) {
      throw new RangeError("The selected model does not expose reasoning configuration.");
    }

    return undefined;
  }

  if (override !== undefined && !capability.supportedPresets.includes(override)) {
    throw new RangeError(`The selected model does not support reasoning preset "${override}".`);
  }

  return override === undefined
    ? { preset: capability.defaultPreset, source: "model-default" }
    : { preset: override, source: "override" };
}
