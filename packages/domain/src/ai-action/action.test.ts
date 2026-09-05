import { describe, expect, it } from "vite-plus/test";
import {
  aiActionDescriptorSchema,
  aiActionIdentitySchema,
  aiActionInputSchema,
  aiActionResultSchema,
} from "./action";

describe("AI action contracts", () => {
  it.each(["", " ", " action", "action ", "x".repeat(121)])(
    "rejects invalid identities consistently across action contracts: %j",
    (identity) => {
      expect(aiActionIdentitySchema.safeParse(identity).success).toBe(false);
      expect(
        aiActionDescriptorSchema.safeParse({ id: identity, label: "Action", requiresText: false })
          .success,
      ).toBe(false);
      expect(
        aiActionInputSchema.safeParse({
          executionId: "run",
          target: identity,
          actionId: "write",
          text: "",
        }).success,
      ).toBe(false);
    },
  );

  it("validates the metadata exposed to an editor without exposing implementation details", () => {
    const descriptor = { id: "write", label: "Write anew", requiresText: false };
    expect(aiActionDescriptorSchema.parse(descriptor)).toEqual(descriptor);
    for (const invalid of [
      { ...descriptor, label: " " },
      { ...descriptor, requiresText: "false" },
      { ...descriptor, prepare: () => ({}) },
    ]) {
      expect(aiActionDescriptorSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("accepts empty text for creation and bounds requests", () => {
    const input = { executionId: "operation", target: "field", actionId: "write", text: "" };
    expect(aiActionInputSchema.parse(input)).toEqual(input);
    expect(() => aiActionInputSchema.parse({ ...input, text: "x".repeat(40_001) })).toThrow();
    expect(() => aiActionInputSchema.parse({ ...input, target: " " })).toThrow();
    expect(() =>
      aiActionInputSchema.parse({ ...input, instructions: "Renderer-owned instructions" }),
    ).toThrow();
  });

  it("keeps completion, failure, and cancellation mutually exclusive", () => {
    expect(aiActionResultSchema.parse({ status: "cancelled" })).toEqual({ status: "cancelled" });
    expect(() => aiActionResultSchema.parse({ status: "completed" })).toThrow();
    expect(() => aiActionResultSchema.parse({ status: "completed", text: "" })).toThrow();
    expect(() => aiActionResultSchema.parse({ status: "failed", text: "Output" })).toThrow();
    expect(() => aiActionResultSchema.parse({ status: "cancelled", text: "Output" })).toThrow();
  });
});
