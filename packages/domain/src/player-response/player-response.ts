import * as z from "zod/mini";
import { THREAD_MESSAGE_MAX_CODE_UNITS } from "../thread/content";

export const playerResponseSchema = z.object({
  text: z.string().check(z.minLength(1), z.maxLength(THREAD_MESSAGE_MAX_CODE_UNITS)),
});
export type PlayerResponse = Readonly<z.output<typeof playerResponseSchema>>;
