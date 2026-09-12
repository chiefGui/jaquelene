import { ThreadTranscriptEntryKind, type ThreadTranscriptEntry } from "@jaquelene/domain";

export function transcriptEntryRole(entry: ThreadTranscriptEntry) {
  if (entry.kind === ThreadTranscriptEntryKind.Instruction) return "System";
  if (entry.author === "user") return "User";
  return "Assistant";
}

export function formatTranscript(entries: readonly ThreadTranscriptEntry[]) {
  return entries
    .map((entry) => `${transcriptEntryRole(entry).toUpperCase()}\n${entry.content}`)
    .join("\n\n");
}
