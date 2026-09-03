import { describe, expect, it } from "vite-plus/test";
import { encodeNanoGptReasoning, normalizeNanoGptReasoning } from "./reasoning";

describe("NanoGPT reasoning", () => {
  it("exposes exactly the efforts reported for a reasoning model", () => {
    expect(normalizeNanoGptReasoning("maker/model", true, ["none", "low", "high", "max"])).toEqual({
      defaultPreset: "automatic",
      supportedPresets: ["automatic", "max", "high", "low", "off"],
    });
  });

  it("marks reasoning without configurable efforts as provider managed", () => {
    expect(normalizeNanoGptReasoning("maker/model", true, undefined)).toEqual({
      defaultPreset: "automatic",
      supportedPresets: ["automatic"],
    });
  });

  it("does not invent reasoning for a model without the capability", () => {
    expect(normalizeNanoGptReasoning("maker/model", false, undefined)).toBeUndefined();
    expect(normalizeNanoGptReasoning("maker/model", undefined, undefined)).toBeUndefined();
  });

  it.each(["max", "xhigh", "high", "medium", "low", "minimal"] as const)(
    "encodes %s as a NanoGPT effort",
    (preset) => {
      expect(encodeNanoGptReasoning({ preset, source: "selection" })).toBe(preset);
    },
  );

  it("encodes disabled reasoning and omits provider defaults", () => {
    expect(encodeNanoGptReasoning({ preset: "off", source: "selection" })).toBe("none");
    expect(encodeNanoGptReasoning({ preset: "automatic", source: "selection" })).toBeUndefined();
    expect(encodeNanoGptReasoning({ preset: "high", source: "model-default" })).toBeUndefined();
  });

  it("rejects reasoning metadata that NanoGPT cannot honor", () => {
    expect(() => normalizeNanoGptReasoning("maker/model", true, ["future"])).toThrow(
      "invalid reasoning effort",
    );
    expect(() => normalizeNanoGptReasoning("maker/model", false, ["high"])).toThrow(
      "contradictory reasoning metadata",
    );
    expect(() => normalizeNanoGptReasoning("maker/model", undefined, ["high"])).toThrow(
      "contradictory reasoning metadata",
    );
    expect(() => encodeNanoGptReasoning({ preset: "on", source: "selection" })).toThrow(
      'does not support the binary reasoning preset "on"',
    );
  });
});
