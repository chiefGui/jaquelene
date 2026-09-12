import { describe, expect, it } from "vite-plus/test";
import { formatTranscript } from "./transcript";

describe("copying a full transcript", () => {
  it("includes every role and entry in order, preserving content whitespace", () => {
    expect(
      formatTranscript([
        { kind: "instruction", sourceKey: "system", content: "  Instructions\n" },
        {
          kind: "message",
          messageId: "user-1",
          author: "user",
          content: "First line\n\tSecond line",
        },
        { kind: "message", messageId: "assistant-1", author: "assistant", content: "Response  " },
      ]),
    ).toBe("SYSTEM\n  Instructions\n\n\nUSER\nFirst line\n\tSecond line\n\nASSISTANT\nResponse  ");
  });

  it("produces no text for an empty transcript", () => {
    expect(formatTranscript([])).toBe("");
  });
});
