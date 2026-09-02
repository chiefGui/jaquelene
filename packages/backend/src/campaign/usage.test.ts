import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { generationTable } from "#backend/generation/schema";
import { ids } from "#backend/id";
import { createThreads } from "#backend/thread/threads";
import { providerAttemptTable } from "#backend/usage/schema";
import { createCampaigns } from "./campaigns";
import { createCampaignUsage } from "./usage";

const directories: string[] = [];
const databases: Database[] = [];

function openEnvironment() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-campaign-usage-"));
  const database = openDatabase(join(directory, "jaquelene.sqlite"));
  directories.push(directory);
  databases.push(database);

  return {
    database,
    campaigns: createCampaigns(database),
    usage: createCampaignUsage(database),
    threads: createThreads(database),
  };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("campaign usage", () => {
  it("aggregates every dispatched attempt while preserving reporting coverage", () => {
    const { database, campaigns, threads, usage } = openEnvironment();
    const campaign = campaigns.start({ title: "Usage", composition: [] });
    const turn = threads.startTurn(campaign.threadId, "Hello").turn;
    const preparingTurn = threads.startTurn(campaign.threadId, "Still preparing").turn;

    database
      .insert(generationTable)
      .values([
        {
          id: ids.generation.create(),
          turnId: preparingTurn.id,
          kind: "reply",
          providerId: "openrouter",
          modelId: "maker/model-c",
          status: "pending",
          startedAt: 90,
        },
        {
          id: ids.generation.create(),
          turnId: turn.id,
          kind: "reply",
          providerId: "openrouter",
          modelId: "maker/ignored-preparation",
          status: "failed",
          failureKind: "preparation",
          startedAt: 100,
          finishedAt: 101,
        },
      ])
      .run();
    database
      .insert(providerAttemptTable)
      .values([
        {
          id: ids.providerAttempt.create(),
          generationId: ids.generation.create(),
          threadId: campaign.threadId,
          campaignId: campaign.id,
          providerId: "openrouter",
          requestedModelId: "maker/model-a",
          resolvedModelId: "maker/model-a-v2",
          upstreamProviderId: "upstream-a",
          status: "completed",
          inputTokens: 10,
          cacheReadInputTokens: 0,
          outputTokens: 4,
          reasoningOutputTokens: 2,
          totalTokens: 14,
          costCurrency: "USD",
          costAmountNanos: 12_000,
          costSource: "provider-reported",
          startedAt: 111,
          finishedAt: 112,
        },
        {
          id: ids.providerAttempt.create(),
          generationId: ids.generation.create(),
          threadId: campaign.threadId,
          campaignId: campaign.id,
          providerId: "openrouter",
          requestedModelId: "maker/model-a",
          status: "failed",
          failureKind: "provider",
          startedAt: 121,
          finishedAt: 122,
        },
        {
          id: ids.providerAttempt.create(),
          generationId: ids.generation.create(),
          threadId: campaign.threadId,
          campaignId: campaign.id,
          providerId: "provider-b",
          requestedModelId: "model-b",
          status: "completed",
          inputTokens: 20,
          outputTokens: 5,
          totalTokens: 25,
          costCurrency: "USD",
          costAmountNanos: 20_000,
          costSource: "estimated",
          startedAt: 131,
          finishedAt: 132,
        },
        {
          id: ids.providerAttempt.create(),
          generationId: ids.generation.create(),
          threadId: campaign.threadId,
          campaignId: campaign.id,
          providerId: "openrouter",
          requestedModelId: "maker/model-a",
          status: "pending",
          startedAt: 141,
        },
      ])
      .run();

    expect(usage.get(campaign.id)).toEqual({
      campaignId: campaign.id,
      attempts: { provider: 4, preparing: 1, pending: 1, completed: 2, failed: 1 },
      tokenCoverage: { reported: 2, unknown: 1 },
      tokens: {
        input: 30,
        output: 9,
        total: 39,
        cacheReadInput: 0,
        reasoningOutput: 2,
      },
      costCoverage: { reported: 2, unknown: 1 },
      costs: [
        {
          currency: "USD",
          source: "provider-reported",
          amountNanos: 12_000,
          attempts: 1,
        },
        { currency: "USD", source: "estimated", amountNanos: 20_000, attempts: 1 },
      ],
      models: [
        {
          providerId: "openrouter",
          requestedModelId: "maker/model-a",
          attempts: 2,
        },
        {
          providerId: "openrouter",
          requestedModelId: "maker/model-a",
          resolvedModelId: "maker/model-a-v2",
          upstreamProviderId: "upstream-a",
          attempts: 1,
        },
        { providerId: "provider-b", requestedModelId: "model-b", attempts: 1 },
      ],
    });
  });

  it("distinguishes an empty campaign from an unknown campaign", () => {
    const { campaigns, usage } = openEnvironment();
    const campaign = campaigns.start({ title: "Empty", composition: [] });

    expect(usage.get(campaign.id)).toEqual({
      campaignId: campaign.id,
      attempts: { provider: 0, preparing: 0, pending: 0, completed: 0, failed: 0 },
      tokenCoverage: { reported: 0, unknown: 0 },
      costCoverage: { reported: 0, unknown: 0 },
      costs: [],
      models: [],
    });
    expect(usage.get(ids.campaign.create())).toBeNull();
  });
});
