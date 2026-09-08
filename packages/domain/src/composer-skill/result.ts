import * as z from "zod/mini";
import { THREAD_MESSAGE_MAX_CODE_UNITS } from "../thread/content";

export const composerSkillResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("completed"),
    text: z.string().check(z.minLength(1), z.maxLength(THREAD_MESSAGE_MAX_CODE_UNITS)),
  }),
  z.object({ status: z.literal("cancelled") }),
  z.object({ status: z.literal("failed"), message: z.string() }),
]);
export type ComposerSkillResult = z.output<typeof composerSkillResultSchema>;
