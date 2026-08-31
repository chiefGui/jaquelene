import { describe, expect, it } from "vite-plus/test";
import {
  createSystemInstructions,
  factoryDefaultRoleplaySystemInstruction,
  resolveSystemInstruction,
} from "./system-instructions";

describe("system instructions", () => {
  it("lists the factory default instruction for inspection", () => {
    const systemInstructions = createSystemInstructions();

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
    const systemInstructions = createSystemInstructions();
    const first = systemInstructions.listGroups();

    (first[0]!.instructions[0] as { name: string }).name = "Changed outside the catalog";

    expect(systemInstructions.listGroups()[0]!.instructions[0]).toEqual(
      factoryDefaultRoleplaySystemInstruction,
    );
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
