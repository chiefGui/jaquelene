import { ThreadTranscriptEntryKind, type ThreadTranscript } from "@jaquelene/domain";
import type { ThreadId } from "#backend/id";
import type { ModelInputComposer } from "#backend/model/input-composer";
import type { ThreadEngine } from "./threads";

export type ThreadTranscriptReader = Readonly<{
  get(threadId: ThreadId): ThreadTranscript;
}>;

export function createThreadTranscriptReader(
  threads: Pick<ThreadEngine, "getActiveMessagePath">,
  modelInputs: ModelInputComposer,
): ThreadTranscriptReader {
  return {
    get(threadId) {
      const messages = threads.getActiveMessagePath(threadId);
      const input = modelInputs.compose({ threadId, messages });

      return {
        threadId,
        entries: [
          ...input.instructions.map(({ sourceKey, content }) => ({
            kind: ThreadTranscriptEntryKind.Instruction,
            sourceKey,
            content,
          })),
          ...input.dialogue.map(({ messageId, role: author, content }) => ({
            kind: ThreadTranscriptEntryKind.Message,
            messageId,
            author,
            content,
          })),
        ],
      };
    },
  };
}
