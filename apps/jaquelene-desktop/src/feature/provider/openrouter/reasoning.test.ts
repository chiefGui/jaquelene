import { describe, expect, it } from "vite-plus/test";
import { normalizeOpenRouterReasoning } from "./reasoning";

describe("OpenRouter reasoning", () => {
  it.each([
    [
      "GLM graded mandatory reasoning",
      {
        mandatory: true,
        defaultEnabled: true,
        defaultEffort: "max",
        supportedEfforts: ["max", "high", "low"],
      },
      { defaultPreset: "max", supportedPresets: ["max", "high", "low"] },
    ],
    [
      "binary reasoning off by default",
      { mandatory: false, defaultEnabled: false },
      { defaultPreset: "off", supportedPresets: ["on", "off"] },
    ],
    [
      "binary reasoning on by default",
      { mandatory: false, defaultEnabled: true },
      { defaultPreset: "on", supportedPresets: ["on", "off"] },
    ],
    [
      "binary reasoning with a provider-managed default",
      { mandatory: false },
      {
        defaultPreset: "automatic",
        supportedPresets: ["automatic", "on", "off"],
      },
    ],
    [
      "graded reasoning off by default",
      {
        mandatory: false,
        defaultEnabled: false,
        defaultEffort: "high",
        supportedEfforts: ["high", "medium", "low"],
      },
      { defaultPreset: "off", supportedPresets: ["high", "medium", "low", "off"] },
    ],
    [
      "provider-managed optional default",
      {
        mandatory: false,
        defaultEffort: "medium",
        supportedEfforts: ["high", "medium", "low"],
      },
      {
        defaultPreset: "automatic",
        supportedPresets: ["automatic", "high", "medium", "low", "off"],
      },
    ],
    [
      "fixed mandatory reasoning",
      { mandatory: true },
      { defaultPreset: "on", supportedPresets: ["on"] },
    ],
  ] as const)("normalizes %s", (_description, metadata, expected) => {
    expect(normalizeOpenRouterReasoning("maker/model", metadata)).toEqual(expected);
  });

  it("does not invent a capability when OpenRouter omits reasoning metadata", () => {
    expect(normalizeOpenRouterReasoning("maker/model", undefined)).toBeUndefined();
  });

  it.each([
    [
      { mandatory: true, defaultEnabled: false },
      "cannot require reasoning while disabling it by default",
    ],
    [{ mandatory: true, defaultEffort: "none" }, 'requires reasoning and cannot default to "none"'],
    [
      { mandatory: false, defaultEnabled: true, defaultEffort: "none" },
      'cannot enable reasoning while defaulting its effort to "none"',
    ],
    [
      { mandatory: false, defaultEffort: "high", supportedEfforts: ["medium", "low"] },
      "default effort that is not supported",
    ],
    [{ mandatory: false, supportedEfforts: "high" }, "invalid supported efforts"],
  ] as const)("rejects inconsistent metadata", (metadata, message) => {
    expect(() => normalizeOpenRouterReasoning("maker/model", metadata)).toThrow(message);
  });
});
