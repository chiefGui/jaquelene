import * as z from "zod/mini";
import { reactionSchema } from "@jaquelene/domain";

export const reactionResultSchema = z.discriminatedUnion("status", [
  z.extend(reactionSchema, { status: z.literal("completed") }),
  z.object({ status: z.literal("cancelled") }),
  z.object({ status: z.literal("failed"), message: z.string() }),
]);
export type ReactionResult = z.output<typeof reactionResultSchema>;
