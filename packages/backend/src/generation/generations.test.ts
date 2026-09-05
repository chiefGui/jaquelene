import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Effect } from "effect";
import { createCampaigns } from "#backend/campaign/campaigns";
import { getCampaignUsageAttribution } from "#backend/campaign/usage";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import type { ModelInput } from "#backend/model/input";
import {
  createModelExecutionRunner,
  createModelExecutor,
  ModelProviderError,
  type ModelExecutionRunner,
} from "#backend/model/execution";
import { createModelInputResolver } from "#backend/model/input-resolver";
import type { ModelReasoningCapability } from "#backend/model/reasoning";
import type {
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from "#backend/provider/provider";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
import {
  jaqueleneNarratorSkillDefinition,
  narratorSkillKind,
  narratorSkillRegistration,
} from "#backend/narrator/module";
import { createSkills } from "#backend/skill/skills";
import { createCampaignSkills } from "#backend/campaign/skills";
import { createCampaignInstructionRegistry } from "#backend/campaign/instructions";
import { createNarratorApplication } from "#backend/narrator/module";
import { threadMessageTable } from "#backend/thread/schema";
import { providerAttemptTable } from "#backend/usage/schema";
import { createUsageHistory } from "#backend/usage/history";
import {
  createThreads,
  THREAD_MESSAGE_MAX_CODE_UNITS,
  THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
  THREAD_MESSAGE_PAGE_MAX_COUNT,
} from "#backend/thread/threads";
import { createGenerations, type GenerationOptions } from "./generations";
import { createReplyPreparer, type ReplyAnchor } from "./reply-preparation";
import { generationTable } from "./schema";

const directories: string[] = [];
const databases: Database[] = [];

function threadPageMetadata(messages: readonly { content: string }[]) {
  return {
    messageCountLimit: THREAD_MESSAGE_PAGE_MAX_COUNT,
    messageMaxCodeUnits: THREAD_MESSAGE_MAX_CODE_UNITS,
    contentByteBudget: THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
    contentBytes: messages.reduce((total, { content }) => total + Buffer.byteLength(content), 0),
  };
}

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "jaquelene-generations-"));
  directories.push(directory);
  return join(directory, "jaquelene.sqlite");
}

type TestGenerationProvider = {
  id: string;
  reasoning?: ModelReasoningCapability;
  generate: (
    request: ProviderGenerationRequest & { signal?: AbortSignal },
  ) => Promise<ProviderGenerationResult>;
};

function modelResolver(provider?: TestGenerationProvider) {
  return {
    async getModel(reference: { providerId: string; modelId: string }) {
      if (!provider || reference.providerId !== provider.id) {
        throw new RangeError(`Unknown test model provider "${reference.providerId}".`);
      }

      return {
        id: reference.modelId,
        name: "Test model",
        brandId: "test",
        ...(provider.reasoning ? { reasoning: provider.reasoning } : {}),
      };
    },
  };
}

function generationRouter(provider?: TestGenerationProvider): ProviderGenerationRouter {
  return {
    get(providerId) {
      if (!provider || provider.id !== providerId) {
        return undefined;
      }

      return {
        generate: (request, signal) =>
          provider.generate({ ...request, ...(signal ? { signal } : {}) }),
      };
    },
  };
}

function modelExecutionRunner(provider?: TestGenerationProvider): ModelExecutionRunner {
  const executor = createModelExecutor(modelResolver(provider), generationRouter(provider));
  return createModelExecutionRunner(executor, (effect, options) =>
    Effect.runPromise(effect, options),
  );
}

function openGenerationEnvironment(provider: TestGenerationProvider, now: () => number = Date.now) {
  const database = openDatabase(createDatabasePath());
  const skills = createSkills(database, [narratorSkillRegistration]);
  const instructions = createCampaignInstructionRegistry([
    createNarratorApplication(createCampaignSkills(database, skills)),
  ]);
  const campaigns = createCampaigns(database, now);
  const threads = createThreads(database, now);
  const changed = vi.fn();
  const usage = createUsageHistory(database, changed);
  const generationOptions: GenerationOptions = {
    database,
    replyPreparer: createReplyPreparer(threads, createModelInputResolver(campaigns, instructions)),
    modelExecutor: modelExecutionRunner(provider),
    attempts: usage.attempts,
    getUsageAttribution: (threadId) => getCampaignUsageAttribution(database, threadId),
    now,
  };
  const generations = createGenerations(generationOptions);
  databases.push(database);
  return {
    campaigns,
    changed,
    database,
    generations,
    generationOptions,
    instructions,
    skills,
    threads,
    usage,
  };
}

function deferred<Result>() {
  let resolve!: (result: Result) => void;
  const promise = new Promise<Result>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    closeDatabase(database);
  }

  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("generations", () => {
  it("routes semantic model input and atomically stores its assistant reply", async () => {
    let timestamp = 100;
    const generate = vi.fn(async () => ({
      text: "Assistant reply",
      providerGenerationId: "provider-generation-1",
      resolvedModelId: "maker/resolved-model",
      finishReason: "stop",
      usage: {
        tokens: {
          input: { total: 12, cacheRead: 3 },
          output: { total: 5, reasoning: 2 },
          total: 17,
        },
        cost: {
          currency: "USD" as const,
          amountNanos: 12_345,
          source: "provider-reported" as const,
        },
      },
    }));
    const provider = {
      id: "provider-a",
      generate,
      reasoning: {
        defaultPreset: "medium",
        supportedPresets: ["high", "medium", "low", "off"],
      },
    } satisfies TestGenerationProvider;
    const { database, generations, threads } = openGenerationEnvironment(
      provider,
      () => timestamp++,
    );
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    const result = await generations.generateReply({
      intent: "reply",
      turnId: started.turn.id,
      configuration: {
        model: { providerId: provider.id, modelId: "maker/requested-model" },
        reasoningPreset: "high",
      },
    });

    expect(generate).toHaveBeenCalledWith({
      executionId: result.generation.id,
      groupId: thread.id,
      modelId: "maker/requested-model",
      input: {
        instructions: [],
        dialogue: [{ messageId: started.message.id, role: "user", content: "Hello" }],
      },
      reasoning: { preset: "high", source: "selection" },
      signal: expect.any(AbortSignal),
    });
    expect(result).toEqual({
      threadActivity: { threadId: thread.id, lastActivityAt: 104, turnCount: 1 },
      message: {
        id: expect.stringMatching(/^message_/),
        threadId: thread.id,
        turnId: started.turn.id,
        parentMessageId: started.message.id,
        sequence: 2,
        author: "assistant",
        content: "Assistant reply",
        createdAt: 104,
      },
      generation: {
        id: expect.stringMatching(/^generation_/),
        turnId: started.turn.id,
        intent: "reply",
        providerId: provider.id,
        modelId: "maker/requested-model",
        reasoning: { preset: "high", source: "selection" },
        status: "completed",
        failureKind: null,
        outputMessageId: expect.stringMatching(/^message_/),
        startedAt: 102,
        finishedAt: 104,
      },
    });
    expect(result.generation.outputMessageId).toBe(result.message.id);
    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({
        id: result.generation.id,
        intent: "reply",
        reasoningPreset: "high",
        reasoningPresetSource: "selection",
        status: "completed",
      }),
    );
    expect(database.select().from(providerAttemptTable).get()).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^attempt_/),
        executionId: result.generation.id,
        attributionKind: null,
        attributionId: null,
        providerId: provider.id,
        requestedModelId: "maker/requested-model",
        providerGenerationId: "provider-generation-1",
        resolvedModelId: "maker/resolved-model",
        finishReason: "stop",
        inputTokens: 12,
        cacheReadInputTokens: 3,
        outputTokens: 5,
        reasoningOutputTokens: 2,
        totalTokens: 17,
        costCurrency: "USD",
        costAmountNanos: 12_345,
        costSource: "provider-reported",
        status: "completed",
        startedAt: 103,
        finishedAt: 104,
      }),
    );
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [started.message, result.message],
      ...threadPageMetadata([started.message, result.message]),
    });
  });

  it("records caller-owned attribution and publishes through the shared usage ledger", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generationOptions, threads, changed } = openGenerationEnvironment(provider);
    const attribution = { kind: "test-owner", id: "owner-1" };
    const getUsageAttribution = vi.fn(() => attribution);
    const generations = createGenerations({ ...generationOptions, getUsageAttribution });
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    changed.mockImplementation(() => ({
      attempt: database.select().from(providerAttemptTable).get(),
      generation: database.select().from(generationTable).get(),
    }));

    const result = await generations.generateReply({
      intent: "reply",
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    expect(getUsageAttribution).toHaveBeenCalledExactlyOnceWith(thread.id);
    expect(changed.mock.results.map(({ value }) => value)).toEqual([
      {
        attempt: expect.objectContaining({
          executionId: result.generation.id,
          attributionKind: attribution.kind,
          attributionId: attribution.id,
          status: "pending",
        }),
        generation: expect.objectContaining({ status: "pending", outputMessageId: null }),
      },
      {
        attempt: expect.objectContaining({
          executionId: result.generation.id,
          attributionKind: attribution.kind,
          attributionId: attribution.id,
          status: "completed",
        }),
        generation: expect.objectContaining({
          status: "completed",
          outputMessageId: result.message.id,
        }),
      },
    ]);
  });

  it("records attribution failures without starting a provider attempt", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generationOptions, threads, changed } = openGenerationEnvironment(provider);
    const failure = new Error("Could not resolve usage attribution.");
    const generations = createGenerations({
      ...generationOptions,
      getUsageAttribution() {
        throw failure;
      },
    });
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    await expect(
      generations.generateReply({
        intent: "reply",
        turnId: started.turn.id,
        configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      }),
    ).rejects.toBe(failure);

    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(providerAttemptTable).all()).toEqual([]);
    expect(database.select().from(generationTable).get()).toMatchObject({
      turnId: started.turn.id,
      status: "failed",
      failureKind: "storage",
    });
    expect(changed).not.toHaveBeenCalled();
  });

  it("resolves and snapshots the selected model's reasoning default", async () => {
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: "Reasoned reply" })),
      reasoning: {
        defaultPreset: "medium",
        supportedPresets: ["high", "medium", "low", "off"],
      },
    } satisfies TestGenerationProvider;
    const { generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    const result = await generations.generateReply({
      intent: "reply",
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: { preset: "medium", source: "model-default" },
      }),
    );
    expect(result.generation).toEqual(
      expect.objectContaining({
        reasoning: { preset: "medium", source: "model-default" },
      }),
    );
  });

  it("rejects an unsupported reasoning selection before accepting generation work", async () => {
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: "Unused" })),
      reasoning: {
        defaultPreset: "low",
        supportedPresets: ["low", "off"],
      },
    } satisfies TestGenerationProvider;
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    await expect(
      generations.generateReply({
        intent: "reply",
        turnId: started.turn.id,
        configuration: {
          model: { providerId: provider.id, modelId: "maker/model" },
          reasoningPreset: "high",
        },
      }),
    ).rejects.toThrow('does not support reasoning preset "high"');
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).all()).toEqual([]);
  });

  it("includes the built-in narrator prompt for campaign replies", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { campaigns, generations, threads } = openGenerationEnvironment(provider);
    const campaign = campaigns.start({
      title: "The Long Night",
      composition: [{ kind: narratorSkillKind.key }],
    });
    const started = threads.startTurn(campaign.threadId, "Begin");

    await generations.generateReply({
      intent: "reply",
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    expect(provider.generate).toHaveBeenCalledWith({
      executionId: expect.stringMatching(/^generation_/),
      groupId: campaign.threadId,
      modelId: "maker/model",
      input: {
        instructions: [
          {
            sourceKey: jaqueleneNarratorSkillDefinition.key,
            content: jaqueleneNarratorSkillDefinition.prompt,
          },
        ],
        dialogue: [{ messageId: started.message.id, role: "user", content: "Begin" }],
      },
      signal: expect.any(AbortSignal),
    });
  });

  it("compiles only the selected turn ancestry", async () => {
    const replies = ["First reply", "Second reply"];
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: replies.shift() ?? "Unexpected reply" })),
    };
    const { generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First user message");
    const firstReply = await generations.generateReply({
      intent: "reply",
      turnId: first.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    const second = threads.startTurn(thread.id, "Second user message");

    await generations.generateReply({
      intent: "reply",
      turnId: second.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    expect(provider.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: {
          instructions: [],
          dialogue: [
            { messageId: first.message.id, role: "user", content: "First user message" },
            {
              messageId: firstReply.message.id,
              role: "assistant",
              content: "First reply",
            },
            { messageId: second.message.id, role: "user", content: "Second user message" },
          ],
        },
      }),
    );
  });

  it("regenerates a turn as a sibling output and selects the new branch", async () => {
    const replies = ["First reply", "Regenerated reply"];
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: replies.shift() ?? "Unexpected reply" })),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const first = await generations.generateReply({
      intent: "reply",
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    const regenerated = await generations.generateReply({
      intent: "regeneration",
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    expect(regenerated.threadActivity).not.toBeNull();
    expect(first.generation.intent).toBe("reply");
    expect(regenerated.generation.intent).toBe("regeneration");
    expect(regenerated.message.parentMessageId).toBe(started.message.id);
    expect(provider.generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: {
          instructions: [],
          dialogue: [{ messageId: started.message.id, role: "user", content: "Hello" }],
        },
      }),
    );
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [started.message, regenerated.message],
      ...threadPageMetadata([started.message, regenerated.message]),
    });
    expect(
      database
        .select({
          id: threadMessageTable.id,
          activeChildMessageId: threadMessageTable.activeChildMessageId,
        })
        .from(threadMessageTable)
        .all(),
    ).toEqual(
      expect.arrayContaining([
        { id: started.message.id, activeChildMessageId: regenerated.message.id },
        { id: first.message.id, activeChildMessageId: null },
        { id: regenerated.message.id, activeChildMessageId: null },
      ]),
    );
    expect(database.select().from(generationTable).all()).toHaveLength(2);
  });

  it("preserves a late reply as an inactive branch when the thread advances", async () => {
    const completion = deferred<ProviderGenerationResult>();
    const provider = { id: "provider-a", generate: vi.fn(() => completion.promise) };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First user message");
    const pending = generations.generateReply({
      intent: "reply",
      turnId: first.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledOnce());
    const second = threads.startTurn(thread.id, "Newer user message");

    completion.resolve({
      text: "Late reply",
      providerGenerationId: "late-provider-generation",
      usage: {
        tokens: { input: { total: 8 }, output: { total: 3 }, total: 11 },
      },
    });
    const result = await pending;

    expect(result.threadActivity).toBeNull();
    expect(result.generation).toEqual(
      expect.objectContaining({
        status: "completed",
        outputMessageId: result.message.id,
      }),
    );
    expect(database.select().from(providerAttemptTable).get()).toEqual(
      expect.objectContaining({
        executionId: result.generation.id,
        providerGenerationId: "late-provider-generation",
        totalTokens: 11,
        status: "completed",
      }),
    );
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [first.message, second.message],
      ...threadPageMetadata([first.message, second.message]),
    });
    expect(
      database
        .select({
          id: threadMessageTable.id,
          activeChildMessageId: threadMessageTable.activeChildMessageId,
        })
        .from(threadMessageTable)
        .all(),
    ).toEqual(
      expect.arrayContaining([
        { id: first.message.id, activeChildMessageId: second.message.id },
        { id: second.message.id, activeChildMessageId: null },
        { id: result.message.id, activeChildMessageId: null },
      ]),
    );
  });

  it("snapshots the active branch before asynchronous reply preparation", async () => {
    const preparedInput = deferred<ModelInput>();
    const anchors: ReplyAnchor[] = [];
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => ({ text: "Late reply" })),
    };
    const { generationOptions, threads } = openGenerationEnvironment(provider);
    const generations = createGenerations({
      ...generationOptions,
      replyPreparer: {
        prepare(anchor) {
          anchors.push(anchor);
          return preparedInput.promise;
        },
      },
    });
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First user message");
    const model = { providerId: provider.id, modelId: "maker/model" };
    const pending = generations.generateReply({
      intent: "reply",
      turnId: first.turn.id,
      configuration: { model },
    });
    model.modelId = "mutated/model";
    await vi.waitFor(() => expect(anchors).toHaveLength(1));
    const second = threads.startTurn(thread.id, "Newer user message");

    expect(anchors).toEqual([
      {
        turnId: first.turn.id,
        threadId: thread.id,
        inputMessageId: first.message.id,
      },
    ]);

    preparedInput.resolve({
      instructions: [],
      dialogue: [
        {
          messageId: first.message.id,
          role: "user",
          content: "First user message",
        },
      ],
    });
    const result = await pending;

    expect(result.threadActivity).toBeNull();
    expect(result.generation.modelId).toBe("maker/model");
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "maker/model" }),
    );
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [first.message, second.message],
      ...threadPageMetadata([first.message, second.message]),
    });
  });

  it("allows only one pending generation for each turn", async () => {
    const completion = deferred<ProviderGenerationResult>();
    const provider = { id: "provider-a", generate: vi.fn(() => completion.promise) };
    const { generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const request = {
      intent: "reply" as const,
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    };
    const firstGeneration = generations.generateReply(request);

    await expect(generations.generateReply(request)).rejects.toThrow(
      `Turn "${started.turn.id}" already has a pending generation.`,
    );
    expect(provider.generate).toHaveBeenCalledOnce();

    completion.resolve({ text: "Reply" });
    await expect(firstGeneration).resolves.toEqual(
      expect.objectContaining({ message: expect.objectContaining({ content: "Reply" }) }),
    );
  });

  it("allows independent turns to generate concurrently without racing the active head", async () => {
    const firstCompletion = deferred<ProviderGenerationResult>();
    const secondCompletion = deferred<ProviderGenerationResult>();
    const completions = [firstCompletion, secondCompletion];
    const provider = {
      id: "provider-a",
      generate: vi.fn(() => {
        const completion = completions.shift();

        if (!completion) {
          throw new Error("The test provider received an unexpected request.");
        }

        return completion.promise;
      }),
    };
    const { generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First");
    const second = threads.startTurn(thread.id, "Second");
    const firstGeneration = generations.generateReply({
      intent: "reply",
      turnId: first.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    const secondGeneration = generations.generateReply({
      intent: "reply",
      turnId: second.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledTimes(2));

    secondCompletion.resolve({ text: "Second reply" });
    const secondResult = await secondGeneration;
    firstCompletion.resolve({ text: "First reply" });
    const firstResult = await firstGeneration;

    expect(secondResult.threadActivity).not.toBeNull();
    expect(firstResult.threadActivity).toBeNull();
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [first.message, second.message, secondResult.message],
      ...threadPageMetadata([first.message, second.message, secondResult.message]),
    });
  });

  it("records provider and invalid-output failures without creating messages", async () => {
    const failure = new Error("Provider unavailable");
    const provider = {
      id: "provider-a",
      generate: vi
        .fn<TestGenerationProvider["generate"]>()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({
          text: " \n\t ",
          providerGenerationId: "invalid-output-generation",
          usage: {
            tokens: { input: { total: 7 }, output: { total: 2 }, total: 9 },
          },
        })
        .mockResolvedValueOnce({
          text: "Invalid accounting",
          providerGenerationId: "invalid-accounting-generation",
          usage: {
            tokens: { input: { total: 7 }, output: { total: 2 }, total: 1 },
          },
        }),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    const providerFailure = generations.generateReply({
      intent: "reply",
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    await expect(providerFailure).rejects.toBeInstanceOf(ModelProviderError);
    await expect(providerFailure).rejects.toEqual(
      expect.objectContaining({ cause: failure, message: failure.message }),
    );
    await expect(
      generations.generateReply({
        intent: "retry",
        turnId: started.turn.id,
        configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      generations.generateReply({
        intent: "retry",
        turnId: started.turn.id,
        configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      }),
    ).rejects.toThrow("invalid total token count");

    expect(database.select().from(generationTable).all()).toEqual([
      expect.objectContaining({
        turnId: started.turn.id,
        failureKind: "provider",
      }),
      expect.objectContaining({
        turnId: started.turn.id,
        failureKind: "invalid-output",
      }),
      expect.objectContaining({
        turnId: started.turn.id,
        failureKind: "invalid-output",
      }),
    ]);
    expect(database.select().from(providerAttemptTable).all()).toEqual([
      expect.objectContaining({ status: "failed", failureKind: "provider" }),
      expect.objectContaining({
        status: "completed",
        failureKind: null,
        providerGenerationId: "invalid-output-generation",
        inputTokens: 7,
        outputTokens: 2,
        totalTokens: 9,
      }),
      expect.objectContaining({
        status: "completed",
        failureKind: null,
        providerGenerationId: "invalid-accounting-generation",
        inputTokens: null,
      }),
    ]);
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [started.message],
      ...threadPageMetadata([started.message]),
    });
  });

  it("records interruption without waiting for an uncooperative provider", async () => {
    const provider = {
      id: "provider-a",
      generate: vi.fn(() => new Promise<ProviderGenerationResult>(() => {})),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const controller = new AbortController();
    const interruption = new Error("Generation interrupted by test.");
    const pending = generations.generateReply({
      intent: "reply",
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledOnce());

    controller.abort(interruption);

    await expect(pending).rejects.toBe(interruption);
    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "interrupted" }),
    );
    expect(database.select().from(providerAttemptTable).get()).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "interrupted" }),
    );
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [started.message],
      ...threadPageMetadata([started.message]),
    });
  });

  it("rolls back the assistant message and head when completion storage fails", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    database.$client.exec(`
      CREATE TRIGGER reject_generation_completion
      BEFORE UPDATE OF status ON generations
      WHEN NEW.status = 'completed'
      BEGIN
        SELECT RAISE(ABORT, 'rejected by test');
      END;
    `);

    await expect(
      generations.generateReply({
        intent: "reply",
        turnId: started.turn.id,
        configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      }),
    ).rejects.toThrow();

    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({ status: "failed", failureKind: "storage" }),
    );
    expect(database.select().from(providerAttemptTable).get()).toEqual(
      expect.objectContaining({ status: "completed", failureKind: null }),
    );
    expect(threads.listMessages({ threadId: thread.id, direction: "older" })).toEqual({
      messages: [started.message],
      ...threadPageMetadata([started.message]),
    });
    expect(threads.startTurn(thread.id, "After failure").message.sequence).toBe(2);
  });

  it("treats provider identities as metadata rather than local uniqueness", async () => {
    const providerGenerationIds = ["shared-generation", "shared-generation"];
    const provider = {
      id: "provider-a",
      generate: vi.fn(async () => {
        const providerGenerationId = providerGenerationIds.shift();

        if (!providerGenerationId) {
          throw new Error("The test provider received an unexpected request.");
        }

        return { text: "Reply", providerGenerationId };
      }),
    };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const firstThread = threads.create();
    const first = threads.startTurn(firstThread.id, "First thread");
    await generations.generateReply({
      intent: "reply",
      turnId: first.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    const secondThread = threads.create();
    const second = threads.startTurn(secondThread.id, "Second thread");

    const secondResult = await generations.generateReply({
      intent: "reply",
      turnId: second.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    expect(secondResult.generation.status).toBe("completed");
    expect(threads.listMessages({ threadId: secondThread.id, direction: "older" })).toEqual({
      messages: [second.message, secondResult.message],
      ...threadPageMetadata([second.message, secondResult.message]),
    });
    const storedAttempts = database.select().from(providerAttemptTable).all();
    expect(storedAttempts).toHaveLength(2);
    expect(new Set(storedAttempts.map(({ id }) => id)).size).toBe(2);
    expect(storedAttempts.map(({ providerGenerationId }) => providerGenerationId)).toEqual([
      "shared-generation",
      "shared-generation",
    ]);
  });

  it("recovers reply state without taking ownership of provider-attempt recovery", () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider, () => 500);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");

    const generationId = ids.generation.create();
    database
      .insert(generationTable)
      .values({
        id: generationId,
        turnId: started.turn.id,
        intent: "reply",
        providerId: provider.id,
        modelId: "maker/model",
        status: "pending",
        startedAt: 600,
      })
      .run();
    database
      .insert(providerAttemptTable)
      .values({
        id: ids.providerAttempt.create(),
        executionId: generationId,
        providerId: provider.id,
        requestedModelId: "maker/model",
        status: "pending",
        startedAt: 600,
      })
      .run();

    generations.recoverInterrupted();

    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({
        status: "failed",
        failureKind: "interrupted",
        startedAt: 600,
        finishedAt: 600,
      }),
    );
    expect(database.select().from(providerAttemptTable).get()).toEqual(
      expect.objectContaining({
        status: "pending",
        failureKind: null,
        startedAt: 600,
        finishedAt: null,
      }),
    );
  });

  it("enforces generation state, ownership, and pending-attempt constraints", () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First");
    const second = threads.startTurn(thread.id, "Second");
    const pending = {
      turnId: first.turn.id,
      intent: "reply" as const,
      providerId: provider.id,
      modelId: "maker/model",
      status: "pending",
      startedAt: 700,
    } as const;

    database
      .insert(generationTable)
      .values({ id: ids.generation.create(), ...pending })
      .run();

    expect(() =>
      database
        .insert(generationTable)
        .values({ id: ids.generation.create(), ...pending })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(generationTable)
        .values({
          id: ids.generation.create(),
          ...pending,
          turnId: second.turn.id,
          intent: "unknown" as "reply",
        })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(generationTable)
        .values({ id: ids.generation.create(), ...pending, reasoningPreset: "high" })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(generationTable)
        .values({
          id: ids.generation.create(),
          ...pending,
          reasoningPresetSource: "selection",
        })
        .run(),
    ).toThrow();
    expect(() =>
      database
        .insert(generationTable)
        .values({
          id: ids.generation.create(),
          turnId: second.turn.id,
          intent: "reply",
          providerId: provider.id,
          modelId: "maker/model",
          status: "completed",
          outputMessageId: first.message.id,
          startedAt: 700,
          finishedAt: 701,
        })
        .run(),
    ).toThrow();
  });

  it("removes thread content while retaining its provider usage", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    await generations.generateReply({
      intent: "reply",
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    const attempt = database.select().from(providerAttemptTable).get();

    expect(() =>
      database.$client.prepare("DELETE FROM threads WHERE id = ?").run(thread.id),
    ).not.toThrow();
    expect(database.select().from(generationTable).all()).toEqual([]);
    expect(database.select().from(threadMessageTable).all()).toEqual([]);
    expect(database.select().from(providerAttemptTable).all()).toEqual([attempt]);
    expect(threads.get(thread.id)).toBeNull();
  });

  it("rejects an unknown provider identity before persisting an attempt", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generationOptions, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const generations = createGenerations({
      ...generationOptions,
      modelExecutor: modelExecutionRunner(),
    });
    await expect(
      generations.generateReply({
        intent: "reply",
        turnId: started.turn.id,
        configuration: {
          model: { providerId: "missing-provider", modelId: "maker/model" },
        },
      }),
    ).rejects.toThrow('Unknown model provider "missing-provider".');
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).all()).toEqual([]);
  });

  it("stops waiting for uncooperative reply preparation when interrupted", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generationOptions, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const prepare = vi.fn(() => new Promise<never>(() => {}));
    const generations = createGenerations({
      ...generationOptions,
      replyPreparer: { prepare },
    });
    const controller = new AbortController();
    const interruption = new Error("Reply preparation interrupted by test.");
    const pending = generations.generateReply({
      intent: "reply",
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(prepare).toHaveBeenCalledWith(
        expect.objectContaining({
          turnId: started.turn.id,
          threadId: thread.id,
          inputMessageId: started.message.id,
        }),
        controller.signal,
      ),
    );

    controller.abort(interruption);

    await expect(pending).rejects.toBe(interruption);
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).get()).toEqual(
      expect.objectContaining({
        turnId: started.turn.id,
        status: "failed",
        failureKind: "interrupted",
      }),
    );
  });

  it("rejects missing turns and records malformed preparation before provider work", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, generations, generationOptions, threads } =
      openGenerationEnvironment(provider);
    const missingTurnId = ids.turn.create();

    await expect(
      generations.generateReply({
        intent: "reply",
        turnId: missingTurnId,
        configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      }),
    ).rejects.toThrow(`Turn "${missingTurnId}" does not exist.`);

    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const malformed = createGenerations({
      ...generationOptions,
      replyPreparer: {
        prepare: () => ({
          instructions: [],
          dialogue: [{ messageId: ids.message.create(), role: "user", content: "Hello" }],
        }),
      },
    });

    await expect(
      malformed.generateReply({
        intent: "reply",
        turnId: started.turn.id,
        configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      }),
    ).rejects.toThrow("A prepared reply must end with its accepted user input.");
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).all()).toEqual([
      expect.objectContaining({
        turnId: started.turn.id,
        status: "failed",
        failureKind: "preparation",
      }),
    ]);
  });
});
