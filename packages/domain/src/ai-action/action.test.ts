import { describe, expect, it } from "vite-plus/test";
import { aiActionInputSchema, aiActionResultSchema } from "./action";

describe("AI action contracts", () => {
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
