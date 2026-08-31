import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import { factoryRoleplay } from "./factory/roleplay";
import {
  createSystemInstructions,
  resolveSystemInstruction,
  type SystemInstructionContribution,
} from "./system-instructions";

describe("system instructions", () => {
  it("lists the factory default instruction for inspection", () => {
    const systemInstructions = createSystemInstructions([factoryRoleplay]);

    expect(systemInstructions.listGroups()).toEqual([
      {
        key: "roleplay",
        name: "Roleplay",
        description: "Instructions that guide how the AI behaves during roleplay.",
        instructions: [
          {
            key: "factory.roleplay.default",
            name: "Default",
            content:
              "You are the narrator of an interactive roleplay. Use the provided context to portray the world and its characters, maintain continuity, and continue the story through narration and dialogue.",
            origin: "factory",
          },
        ],
      },
    ]);
  });

  it("returns owned listings", () => {
    const systemInstructions = createSystemInstructions([factoryRoleplay]);
    const first = systemInstructions.listGroups();

    (first[0]!.instructions[0] as { name: string }).name = "Changed outside the catalog";

    expect(systemInstructions.listGroups()[0]!.instructions[0]!.name).toBe("Default");
  });

  it("applies the factory roleplay instruction only to campaigns", () => {
    const systemInstructions = createSystemInstructions([factoryRoleplay]);
    const threadId = ids.thread.create();

    expect(systemInstructions.resolve({ threadId, campaign: null })).toEqual([]);
    expect(
      systemInstructions.resolve({
        threadId,
        campaign: {
          id: ids.campaign.create(),
          scenarioId: ids.scenario.create(),
        },
      }),
    ).toEqual([
      {
        sourceKey: "factory.roleplay.default",
        content:
          "You are the narrator of an interactive roleplay. Use the provided context to portray the world and its characters, maintain continuity, and continue the story through narration and dialogue.",
      },
    ]);
  });

  it("preserves contribution order", () => {
    const contribution = (key: string): SystemInstructionContribution => ({
      listGroups: () => [],
      resolve: () => [{ key, name: key, content: `${key} content` }],
    });
    const systemInstructions = createSystemInstructions([
      contribution("global"),
      contribution("scenario"),
      contribution("campaign"),
    ]);

    expect(
      systemInstructions.resolve({
        threadId: ids.thread.create(),
        campaign: null,
      }),
    ).toEqual([
      { sourceKey: "global", content: "global content" },
      { sourceKey: "scenario", content: "scenario content" },
      { sourceKey: "campaign", content: "campaign content" },
    ]);
  });

  it("resolves the reusable instruction primitive into model input", () => {
    expect(
      resolveSystemInstruction({
        key: "roleplay.custom",
        name: "Custom",
        content: "Custom roleplay behavior.",
      }),
    ).toEqual({
      sourceKey: "roleplay.custom",
      content: "Custom roleplay behavior.",
    });
  });
});
