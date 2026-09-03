import { describe, expect, it } from "vite-plus/test";
import { PROMPT_KIND_KEY_MAX_LENGTH, parsePromptKey, parsePromptKindKey } from "./identity";

describe("prompt identity", () => {
  it("parses opaque prompt keys", () => {
    expect(parsePromptKey("builtin.test.default")).toBe("builtin.test.default");
    expect(() => parsePromptKey("")).toThrow("Prompt key is invalid.");
  });

  it("parses stable prompt kind keys", () => {
    expect(parsePromptKindKey("test-behavior")).toBe("test-behavior");
    expect(() => parsePromptKindKey("Invalid")).toThrow("Prompt kind key is invalid.");
  });

  it("bounds prompt kind keys", () => {
    expect(parsePromptKindKey(`a${"b".repeat(PROMPT_KIND_KEY_MAX_LENGTH - 1)}`)).toHaveLength(
      PROMPT_KIND_KEY_MAX_LENGTH,
    );
    expect(() => parsePromptKindKey(`a${"b".repeat(PROMPT_KIND_KEY_MAX_LENGTH)}`)).toThrow(
      "Prompt kind key is invalid.",
    );
  });
});
