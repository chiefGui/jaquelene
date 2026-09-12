import * as z from "zod/mini";
import { playerResponseSchema } from "@jaquelene/domain";

export const playerResponseResultSchema = z.discriminatedUnion("status", [
  z.extend(playerResponseSchema, { status: z.literal("completed") }),
  z.object({ status: z.literal("cancelled") }),
  z.object({ status: z.literal("failed"), message: z.string() }),
]);
export type PlayerResponseResult = z.output<typeof playerResponseResultSchema>;
