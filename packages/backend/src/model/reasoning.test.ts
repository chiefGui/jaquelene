import { describe, expect, it } from "vite-plus/test";
import {
  requireModelReasoningCapability,
  requireResolvedReasoning,
  resolveReasoning,
} from "./reasoning";

describe("model reasoning", () => {
  it.each([
    { defaultPreset: "off", supportedPresets: ["on", "off"] },
    { defaultPreset: "automatic", supportedPresets: ["automatic", "on", "off"] },
    { defaultPreset: "high", supportedPresets: ["max", "high", "low", "off"] },
    { defaultPreset: "automatic", supportedPresets: ["automatic"] },
    {
      defaultPreset: "automatic",
      supportedPresets: ["automatic", "high", "low", "off"],
    },
  ])("normalizes a valid capability", (candidate) => {
    expect(requireModelReasoningCapability(candidate)).toEqual(candidate);
  });

  it("uses one canonical presentation order for every provider", () => {
    expect(
      requireModelReasoningCapability({
        defaultPreset: "medium",
        supportedPresets: ["off", "low", "automatic", "max", "medium"],
      }),
    ).toEqual({
      defaultPreset: "medium",
      supportedPresets: ["automatic", "max", "medium", "low", "off"],
    });
  });

  it.each([
    [{ defaultPreset: "off", supportedPresets: [] }, "at least one supported preset"],
    [{ defaultPreset: "off", supportedPresets: ["off"] }, "only disabled reasoning"],
    [
      { defaultPreset: "on", supportedPresets: ["on", "high", "off"] },
      "cannot mix binary and graded",
    ],
    [
      { defaultPreset: "high", supportedPresets: ["high", "high"] },
      'repeats supported preset "high"',
    ],
    [{ defaultPreset: "future", supportedPresets: ["high"] }, "invalid default preset"],
    [
      { defaultPreset: "high", supportedPresets: ["medium", "low"] },
      "default preset that is not supported",
    ],
  ])("rejects an inconsistent capability", (candidate, message) => {
    expect(() => requireModelReasoningCapability(candidate)).toThrow(message as string);
  });

  it("resolves defaults and explicit selections without approximation", () => {
    const capability = requireModelReasoningCapability({
      defaultPreset: "medium",
      supportedPresets: ["high", "medium", "low", "off"],
    });

    expect(resolveReasoning(capability, undefined)).toEqual({
      preset: "medium",
      source: "model-default",
    });
    expect(resolveReasoning(capability, "high")).toEqual({
      preset: "high",
      source: "selection",
    });
    expect(() => resolveReasoning(capability, "max")).toThrow(
      'does not support reasoning preset "max"',
    );
  });

  it("rejects reasoning for a model without a capability", () => {
    expect(resolveReasoning(undefined, undefined)).toBeUndefined();
    expect(() => resolveReasoning(undefined, "high")).toThrow(
      "does not expose reasoning configuration",
    );
  });

  it("validates resolved reasoning provenance", () => {
    expect(requireResolvedReasoning({ preset: "high", source: "selection" })).toEqual({
      preset: "high",
      source: "selection",
    });
    expect(() => requireResolvedReasoning({ preset: "high", source: "fallback" })).toThrow(
      'Unknown reasoning preset source "fallback"',
    );
  });
});
