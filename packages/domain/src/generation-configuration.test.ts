import { describe, expect, it } from "vite-plus/test";
import {
  composeCampaignGenerationConfiguration,
  setCampaignGenerationModel,
  setCampaignGenerationReasoningPreset,
  type CampaignGenerationPreferences,
} from "./generation-configuration";

type Model = Readonly<{
  providerId: string;
  modelId: string;
  name: string;
}>;

type ReasoningPreset = "off" | "low" | "medium" | "high";

function model(modelId: string, providerId = "provider"): Model {
  return { providerId, modelId, name: `Model ${modelId}` };
}

describe("campaign generation configuration", () => {
  it("composes independent campaign preferences over the default model", () => {
    const defaultModel = model("default");

    expect(composeCampaignGenerationConfiguration(defaultModel, undefined)).toEqual({
      model: defaultModel,
    });
    expect(
      composeCampaignGenerationConfiguration(defaultModel, { reasoningPreset: "high" }),
    ).toEqual({ model: defaultModel, reasoningPreset: "high" });
    const nextDefaultModel = model("next-default");
    expect(
      composeCampaignGenerationConfiguration(nextDefaultModel, { reasoningPreset: "high" }),
    ).toEqual({ model: nextDefaultModel, reasoningPreset: "high" });

    const selectedModel = model("selected");
    expect(
      composeCampaignGenerationConfiguration(defaultModel, {
        model: selectedModel,
        reasoningPreset: "low",
      }),
    ).toEqual({ model: selectedModel, reasoningPreset: "low" });
  });

  it("keeps reasoning preferences dormant until a model becomes available", () => {
    expect(
      composeCampaignGenerationConfiguration<Model, ReasoningPreset>(null, {
        reasoningPreset: "high",
      }),
    ).toBeNull();
  });

  it("stores model and reasoning choices independently", () => {
    const defaultModel = model("default");
    const selectedModel = model("selected");
    const reasoning = {
      defaultPreset: "medium" as const,
      supportedPresets: ["high", "medium", "low"] as const,
    };

    expect(setCampaignGenerationModel(undefined, selectedModel, defaultModel, reasoning)).toEqual({
      model: selectedModel,
    });
    expect(
      setCampaignGenerationReasoningPreset<Model, ReasoningPreset>(
        { model: selectedModel },
        "high",
      ),
    ).toEqual({ model: selectedModel, reasoningPreset: "high" });
    expect(
      setCampaignGenerationReasoningPreset<Model, ReasoningPreset>(
        { model: selectedModel, reasoningPreset: "high" },
        undefined,
      ),
    ).toEqual({ model: selectedModel });
  });

  it("inherits the default model without discarding a compatible reasoning choice", () => {
    const defaultModel = model("default");
    const preferences: CampaignGenerationPreferences<Model, ReasoningPreset> = {
      model: model("previous"),
      reasoningPreset: "high",
    };

    expect(
      setCampaignGenerationModel(preferences, defaultModel, defaultModel, {
        defaultPreset: "medium",
        supportedPresets: ["high", "medium", "low"],
      }),
    ).toEqual({ reasoningPreset: "high" });
  });

  it("distinguishes the same model identity across providers", () => {
    const defaultModel = model("shared", "provider-a");
    const selectedModel = model("shared", "provider-b");

    expect(setCampaignGenerationModel(undefined, selectedModel, defaultModel, undefined)).toEqual({
      model: selectedModel,
    });
  });

  it.each([
    ["the new model default", { defaultPreset: "high", supportedPresets: ["high", "low"] }],
    ["unsupported", { defaultPreset: "medium", supportedPresets: ["medium", "low"] }],
    ["unavailable", undefined],
  ] as const)("discards reasoning when it is %s", (_case, reasoning) => {
    expect(
      setCampaignGenerationModel(
        { reasoningPreset: "high" as const },
        model("selected"),
        model("default"),
        reasoning,
      ),
    ).toEqual({ model: model("selected") });
  });

  it("removes empty campaign preferences", () => {
    expect(
      setCampaignGenerationReasoningPreset<Model, ReasoningPreset>(undefined, undefined),
    ).toBeUndefined();
    expect(
      setCampaignGenerationModel(undefined, model("default"), model("default"), undefined),
    ).toBeUndefined();
  });
});
