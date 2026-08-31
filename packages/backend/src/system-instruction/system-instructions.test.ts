import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import { factoryRoleplay } from "./factory/roleplay";
import {
  createSystemInstructions,
  resolveSystemInstruction,
  type SystemInstructionSource,
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
            content: expect.any(String),
            origin: "factory",
          },
        ],
      },
    ]);
    expect(systemInstructions.listGroups()[0]!.instructions[0]!.content.trim()).not.toBe("");
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
    const instruction = systemInstructions.listGroups()[0]!.instructions[0]!;

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
        sourceKey: instruction.key,
        content: instruction.content,
      },
    ]);
  });

  it("owns and preserves source order", () => {
    const source = (key: string): SystemInstructionSource => ({
      listGroups: () => [],
      resolve: () => [{ key, name: key, content: `${key} content` }],
    });
    const sources = [source("global"), source("scenario")];
    const systemInstructions = createSystemInstructions(sources);
    sources.reverse();
    sources.push(source("campaign"));

    expect(
      systemInstructions.resolve({
        threadId: ids.thread.create(),
        campaign: null,
      }),
    ).toEqual([
      { sourceKey: "global", content: "global content" },
      { sourceKey: "scenario", content: "scenario content" },
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
