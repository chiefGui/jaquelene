import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import { factoryRoleplay } from "./factory/roleplay";
import { createInstructionRegistry, resolveInstruction, type InstructionSource } from "./registry";

describe("instruction registry", () => {
  it("lists the factory default instruction for inspection", () => {
    const instructions = createInstructionRegistry([factoryRoleplay]);

    expect(instructions.listGroups()).toEqual([
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
    expect(instructions.listGroups()[0]!.instructions[0]!.content.trim()).not.toBe("");
  });

  it("returns owned listings", () => {
    const instructions = createInstructionRegistry([factoryRoleplay]);
    const first = instructions.listGroups();

    (first[0]!.instructions[0] as { name: string }).name = "Changed outside the catalog";

    expect(instructions.listGroups()[0]!.instructions[0]!.name).toBe("Default");
  });

  it("applies the factory roleplay instruction only to campaigns", () => {
    const instructions = createInstructionRegistry([factoryRoleplay]);
    const threadId = ids.thread.create();

    expect(instructions.resolve({ threadId, campaign: null })).toEqual([]);
    const instruction = instructions.listGroups()[0]!.instructions[0]!;

    expect(
      instructions.resolve({
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
    const source = (key: string): InstructionSource => ({
      listGroups: () => [],
      resolve: () => [{ key, name: key, content: `${key} content` }],
    });
    const sources = [source("global"), source("scenario")];
    const instructions = createInstructionRegistry(sources);
    sources.reverse();
    sources.push(source("campaign"));

    expect(
      instructions.resolve({
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
      resolveInstruction({
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
