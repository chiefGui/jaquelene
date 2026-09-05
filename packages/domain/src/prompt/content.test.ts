import { describe, expect, it } from "vite-plus/test";
import { PROMPT_MAX_LENGTH, promptSchema } from "./content";

describe("prompt", () => {
  it("preserves instruction formatting", () => {
    const prompt = "  Keep this indentation.\n\n- Keep this list.\n";
    expect(promptSchema.parse(prompt)).toBe(prompt);
  });

  it("requires nonblank, bounded instruction text", () => {
    expect(promptSchema.safeParse(" \n\t ").success).toBe(false);
    expect(promptSchema.safeParse("p".repeat(PROMPT_MAX_LENGTH)).success).toBe(true);
    expect(promptSchema.safeParse("p".repeat(PROMPT_MAX_LENGTH + 1)).success).toBe(false);
  });
});
