import { describe, expect, it } from "vite-plus/test";
import * as z from "zod/mini";
import { ThreadTranscriptEntryKind, threadTranscriptSchema } from "./transcript";

describe("thread transcript schema", () => {
  it("preserves distinct instruction and message entries", () => {
    const transcript = {
      threadId: "thread-1",
      entries: [
        {
          kind: ThreadTranscriptEntryKind.Instruction,
          sourceKey: "narrator",
          content: "Narrate clearly.",
        },
        {
          kind: ThreadTranscriptEntryKind.Message,
          messageId: "message-1",
          author: "user",
          content: "Hello",
        },
      ],
    };

    expect(z.parse(threadTranscriptSchema, transcript)).toEqual(transcript);
  });

  it("rejects entries with mismatched provenance", () => {
    expect(
      z.safeParse(threadTranscriptSchema, {
        threadId: "thread-1",
        entries: [
          {
            kind: ThreadTranscriptEntryKind.Instruction,
            messageId: "message-1",
            author: "assistant",
            content: "Hello",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
