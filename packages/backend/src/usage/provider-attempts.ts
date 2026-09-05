import { and, eq, sql } from "drizzle-orm";
import type { Database } from "#backend/database/database";
import { ids, type ProviderAttemptId } from "#backend/id";
import type { ProviderAccounting } from "#backend/provider/accounting";
import {
  providerAttemptTable,
  type ProviderAttempt,
  type ProviderAttemptFailureKind,
} from "./schema";
import type { UsageAttribution } from "./types";

type ProviderAttemptSource = Pick<Database, "update">;

export type StartProviderAttempt = Readonly<{
  executionId: string;
  attribution?: UsageAttribution;
  providerId: string;
  requestedModelId: string;
  startedAt: number;
}>;

export type ProviderAttemptSettlement =
  | Readonly<{ status: "completed"; finishedAt: number; accounting: ProviderAccounting }>
  | Readonly<{
      status: "failed";
      failureKind: ProviderAttemptFailureKind;
      finishedAt: number;
    }>;

function providerAccountingFields(accounting: ProviderAccounting) {
  return {
    providerGenerationId: accounting.providerGenerationId,
    resolvedModelId: accounting.resolvedModelId,
    upstreamProviderId: accounting.upstreamProviderId,
    finishReason: accounting.finishReason,
    inputTokens: accounting.usage?.tokens.input.total ?? null,
    cacheReadInputTokens: accounting.usage?.tokens.input.cacheRead ?? null,
    cacheWriteInputTokens: accounting.usage?.tokens.input.cacheWrite ?? null,
    outputTokens: accounting.usage?.tokens.output.total ?? null,
    reasoningOutputTokens: accounting.usage?.tokens.output.reasoning ?? null,
    totalTokens: accounting.usage?.tokens.total ?? null,
    costCurrency: accounting.usage?.cost?.currency ?? null,
    costAmountNanos: accounting.usage?.cost?.amountNanos ?? null,
    costSource: accounting.usage?.cost?.source ?? null,
  };
}

export function settleProviderAttemptInTransaction(
  source: ProviderAttemptSource,
  id: ProviderAttemptId,
  settlement: ProviderAttemptSettlement,
) {
  let fields;

  if (settlement.status === "completed") {
    fields = {
      status: settlement.status,
      finishedAt: settlement.finishedAt,
      ...providerAccountingFields(settlement.accounting),
    };
  } else {
    fields = {
      status: settlement.status,
      failureKind: settlement.failureKind,
      finishedAt: settlement.finishedAt,
    };
  }

  const attempt = source
    .update(providerAttemptTable)
    .set(fields)
    .where(and(eq(providerAttemptTable.id, id), eq(providerAttemptTable.status, "pending")))
    .returning()
    .get();

  if (!attempt) {
    throw new Error(`Provider attempt "${id}" is no longer pending.`);
  }

  return attempt;
}

export function createProviderAttempts(database: Database, changed: () => void) {
  return {
    start(input: StartProviderAttempt): ProviderAttempt {
      const attempt = database
        .insert(providerAttemptTable)
        .values({
          id: ids.providerAttempt.create(),
          executionId: input.executionId,
          attributionKind: input.attribution?.kind ?? null,
          attributionId: input.attribution?.id ?? null,
          providerId: input.providerId,
          requestedModelId: input.requestedModelId,
          status: "pending",
          startedAt: input.startedAt,
        })
        .returning()
        .get();

      if (!attempt) {
        throw new Error(
          `Could not record a provider attempt for execution "${input.executionId}".`,
        );
      }

      changed();
      return attempt;
    },
    settle(id: ProviderAttemptId, settlement: ProviderAttemptSettlement) {
      const attempt = settleProviderAttemptInTransaction(database, id, settlement);
      changed();
      return attempt;
    },
    recoverInterrupted(recoveryTime: number) {
      const recovered = database
        .update(providerAttemptTable)
        .set({
          status: "failed",
          failureKind: "interrupted",
          finishedAt: sql`max(${providerAttemptTable.startedAt}, ${recoveryTime})`,
        })
        .where(eq(providerAttemptTable.status, "pending"))
        .run();

      if (recovered.changes > 0) {
        changed();
      }
    },
    changed,
  };
}

export type ProviderAttempts = ReturnType<typeof createProviderAttempts>;
