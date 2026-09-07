import * as z from "zod/mini";

// Opening narration precedes the first player turn.
export const threadTurnIdSchema = z.nullable(z.string().check(z.minLength(1)));
export type ThreadTurnId = z.output<typeof threadTurnIdSchema>;
