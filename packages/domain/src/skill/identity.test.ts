import { describe, expect, it } from "vite-plus/test";
import { SKILL_KIND_KEY_MAX_LENGTH, parseSkillKey, parseSkillKindKey } from "./identity";

describe("skill identity", () => {
  it("parses opaque skill keys", () => {
    expect(parseSkillKey("builtin.test.default")).toBe("builtin.test.default");
    expect(() => parseSkillKey("")).toThrow("Skill key is invalid.");
  });

  it("parses stable skill kind keys", () => {
    expect(parseSkillKindKey("test-behavior")).toBe("test-behavior");
    expect(() => parseSkillKindKey("Invalid")).toThrow("Skill kind key is invalid.");
  });

  it("bounds skill kind keys", () => {
    expect(parseSkillKindKey(`a${"b".repeat(SKILL_KIND_KEY_MAX_LENGTH - 1)}`)).toHaveLength(
      SKILL_KIND_KEY_MAX_LENGTH,
    );
    expect(() => parseSkillKindKey(`a${"b".repeat(SKILL_KIND_KEY_MAX_LENGTH)}`)).toThrow(
      "Skill kind key is invalid.",
    );
  });
});
