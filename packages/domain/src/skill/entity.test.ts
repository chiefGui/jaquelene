import { describe, expect, it } from "vite-plus/test";
import { parseSkillKey, parseSkillKindKey } from "./identity";
import { SkillOrigin, parseSkill, skillSchema } from "./entity";

const common = {
  key: parseSkillKey("builtin.narrator.default"),
  kind: parseSkillKindKey("narrator"),
  title: "Default",
  prompt: "Narrate in second person.",
};

describe("skill entity", () => {
  it("keeps lifecycle metadata exclusive to custom skills", () => {
    expect(parseSkill({ ...common, origin: SkillOrigin.BuiltIn })).toEqual({
      ...common,
      origin: SkillOrigin.BuiltIn,
    });
    expect(
      skillSchema.safeParse({
        ...common,
        origin: SkillOrigin.BuiltIn,
        createdAt: 1,
        updatedAt: 1,
      }).success,
    ).toBe(false);
  });

  it("requires ordered lifecycle metadata for custom skills", () => {
    expect(
      parseSkill({
        ...common,
        key: parseSkillKey("skill_01"),
        origin: SkillOrigin.Custom,
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toMatchObject({ createdAt: 1, updatedAt: 2 });
    expect(
      skillSchema.safeParse({
        ...common,
        key: parseSkillKey("skill_01"),
        origin: SkillOrigin.Custom,
        createdAt: 2,
        updatedAt: 1,
      }).success,
    ).toBe(false);
  });
});
