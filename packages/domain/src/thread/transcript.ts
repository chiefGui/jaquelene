import * as z from "zod/mini";

export const ThreadTranscriptEntryKind = Object.freeze({
  Instruction: "instruction",
  Message: "message",
} as const);

const identitySchema = z.string().check(z.minLength(1));
const contentSchema = z.string().check(z.refine((content) => content.trim().length > 0));

export const threadTranscriptInstructionSchema = z.strictObject({
  kind: z.literal(ThreadTranscriptEntryKind.Instruction),
  sourceKey: identitySchema,
  content: contentSchema,
});

export const threadTranscriptMessageSchema = z.strictObject({
  kind: z.literal(ThreadTranscriptEntryKind.Message),
  messageId: identitySchema,
  author: z.enum(["user", "assistant"]),
  content: contentSchema,
});

export const threadTranscriptEntrySchema = z.discriminatedUnion("kind", [
  threadTranscriptInstructionSchema,
  threadTranscriptMessageSchema,
]);

export const threadTranscriptSchema = z.strictObject({
  threadId: identitySchema,
  entries: z.array(threadTranscriptEntrySchema),
});

export type ThreadTranscriptInstruction = Readonly<
  z.output<typeof threadTranscriptInstructionSchema>
>;
export type ThreadTranscriptMessage = Readonly<z.output<typeof threadTranscriptMessageSchema>>;
export type ThreadTranscriptEntry = ThreadTranscriptInstruction | ThreadTranscriptMessage;
export type ThreadTranscript = Readonly<{
  threadId: string;
  entries: readonly ThreadTranscriptEntry[];
}>;
