import { and, eq } from "drizzle-orm";
import { campaignTable } from "#backend/campaign/schema";
import type { Database } from "#backend/database/database";
import { ids, type GenerationId, type ProviderAttemptId, type ThreadId } from "#backend/id";
import type { ProviderAccounting } from "./accounting";
import { providerAccountingFields } from "./accounting";
import {
  providerAttemptTable,
  type ProviderAttempt,
  type ProviderAttemptFailureKind,
} from "./schema";

type ProviderAttemptSource = Pick<Database, "update">;

export type StartProviderAttempt = Readonly<{
  generationId: GenerationId;
  threadId: ThreadId;
  providerId: string;
  requestedModelId: string;
  startedAt: number;
}>;

export type ProviderAttemptSettlement =
  | Readonly<{ status: "completed"; finishedAt: number }>
  | Readonly<{
      status: "failed";
      failureKind: ProviderAttemptFailureKind;
      finishedAt: number;
    }>;

export function settleProviderAttempt(
  source: ProviderAttemptSource,
  id: ProviderAttemptId,
  settlement: ProviderAttemptSettlement,
  accounting?: ProviderAccounting,
) {
  return source
    .update(providerAttemptTable)
    .set({
      ...settlement,
      ...(accounting ? providerAccountingFields(accounting) : {}),
    })
    .where(and(eq(providerAttemptTable.id, id), eq(providerAttemptTable.status, "pending")))
    .returning()
    .get();
}

export function createProviderAttempts(database: Database, changed: () => void) {
  return {
    start(input: StartProviderAttempt): ProviderAttempt {
      const attempt = database.transaction((transaction) => {
        const campaign = transaction
          .select({ id: campaignTable.id })
          .from(campaignTable)
          .where(eq(campaignTable.threadId, input.threadId))
          .get();
        const storedAttempt = transaction
          .insert(providerAttemptTable)
          .values({
            id: ids.providerAttempt.create(),
            generationId: input.generationId,
            threadId: input.threadId,
            campaignId: campaign?.id ?? null,
            providerId: input.providerId,
            requestedModelId: input.requestedModelId,
            status: "pending",
            startedAt: input.startedAt,
          })
          .returning()
          .get();

        if (!storedAttempt) {
          throw new Error(
            `Could not record a provider attempt for generation "${input.generationId}".`,
          );
        }

        return storedAttempt;
      });

      changed();
      return attempt;
    },
    changed,
  };
}

export type ProviderAttempts = ReturnType<typeof createProviderAttempts>;
