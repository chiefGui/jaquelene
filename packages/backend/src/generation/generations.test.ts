import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createCampaigns } from "#backend/campaign/campaigns";
import { closeDatabase, openDatabase, type Database } from "#backend/database/database";
import { ids } from "#backend/id";
import type { ModelInput } from "#backend/model/input";
import type { ModelReasoningCapability } from "#backend/model/reasoning";
import type {
  ProviderGenerationRequest,
  ProviderGenerationResult,
} from "#backend/provider/provider";
import type { ProviderGenerationRouter } from "#backend/provider/providers";
import {
  jaqueleneNarratorPrompt,
  narratorPromptKind,
  narratorPromptModule,
} from "#backend/prompt/narrator";
import { createPromptSubsystem } from "#backend/prompt/subsystem";
import { threadMessageTable } from "#backend/thread/schema";
import { providerAttemptTable } from "#backend/usage/schema";
import {
  createThreads,
  THREAD_MESSAGE_MAX_CODE_UNITS,
  THREAD_MESSAGE_PAGE_CONTENT_BYTE_BUDGET,
  THREAD_MESSAGE_PAGE_MAX_COUNT,
} from "#backend/thread/threads";
import { createGenerations } from "./generations";
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

function openGenerationEnvironment(provider: TestGenerationProvider, now: () => number = Date.now) {
  const database = openDatabase(createDatabasePath());
  const { applications: promptApplications, prompts } = createPromptSubsystem(database, [
    narratorPromptModule,
  ]);
  const campaigns = createCampaigns(database, now);
  const threads = createThreads(database, now);
  const generations = createGenerations(
    database,
    createReplyPreparer(threads, campaigns, promptApplications),
    modelResolver(provider),
    generationRouter(provider),
    now,
  );
  databases.push(database);
  return { campaigns, database, generations, promptApplications, prompts, threads };
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
      turnId: started.turn.id,
      configuration: {
        model: { providerId: provider.id, modelId: "maker/requested-model" },
        reasoningPreset: "high",
      },
    });

    expect(generate).toHaveBeenCalledWith({
      generationId: result.generation.id,
      threadId: thread.id,
      modelId: "maker/requested-model",
      input: {
        instructions: [],
        dialogue: [{ messageId: started.message.id, role: "user", content: "Hello" }],
      },
      reasoning: { preset: "high", source: "selection" },
    });
    expect(result).toEqual({
      activated: true,
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
        reasoningPreset: "high",
        reasoningPresetSource: "selection",
        status: "completed",
      }),
    );
    expect(database.select().from(providerAttemptTable).get()).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^attempt_/),
        generationId: result.generation.id,
        threadId: thread.id,
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

  it("includes the factory narrator prompt for campaign replies", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { campaigns, generations, threads } = openGenerationEnvironment(provider);
    const campaign = campaigns.start({
      title: "The Long Night",
      composition: [{ kind: narratorPromptKind.key }],
    });
    const started = threads.startTurn(campaign.threadId, "Begin");

    await generations.generateReply({
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    expect(provider.generate).toHaveBeenCalledWith({
      generationId: expect.stringMatching(/^generation_/),
      threadId: campaign.threadId,
      modelId: "maker/model",
      input: {
        instructions: [
          {
            sourceKey: jaqueleneNarratorPrompt.key,
            content: jaqueleneNarratorPrompt.body,
          },
        ],
        dialogue: [{ messageId: started.message.id, role: "user", content: "Begin" }],
      },
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
      turnId: first.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    const second = threads.startTurn(thread.id, "Second user message");

    await generations.generateReply({
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
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    const regenerated = await generations.generateReply({
      turnId: started.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    expect(regenerated.activated).toBe(true);
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

    expect(result.activated).toBe(false);
    expect(result.generation).toEqual(
      expect.objectContaining({
        status: "completed",
        outputMessageId: result.message.id,
      }),
    );
    expect(database.select().from(providerAttemptTable).get()).toEqual(
      expect.objectContaining({
        generationId: result.generation.id,
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
    const { database, threads } = openGenerationEnvironment(provider);
    const generations = createGenerations(
      database,
      {
        prepare(anchor) {
          anchors.push(anchor);
          return preparedInput.promise;
        },
      },
      modelResolver(provider),
      generationRouter(provider),
    );
    const thread = threads.create();
    const first = threads.startTurn(thread.id, "First user message");
    const model = { providerId: provider.id, modelId: "maker/model" };
    const pending = generations.generateReply({
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

    expect(result.activated).toBe(false);
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
      turnId: first.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    const secondGeneration = generations.generateReply({
      turnId: second.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledTimes(2));

    secondCompletion.resolve({ text: "Second reply" });
    const secondResult = await secondGeneration;
    firstCompletion.resolve({ text: "First reply" });
    const firstResult = await firstGeneration;

    expect(secondResult.activated).toBe(true);
    expect(firstResult.activated).toBe(false);
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

    await expect(
      generations.generateReply({
        turnId: started.turn.id,
        configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      }),
    ).rejects.toBe(failure);
    await expect(
      generations.generateReply({
        turnId: started.turn.id,
        configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      generations.generateReply({
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
      turnId: first.turn.id,
      configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
    });

    const secondThread = threads.create();
    const second = threads.startTurn(secondThread.id, "Second thread");

    const secondResult = await generations.generateReply({
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

  it("recovers pending attempts left by an interrupted process", () => {
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
        generationId,
        threadId: thread.id,
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
        status: "failed",
        failureKind: "interrupted",
        startedAt: 600,
        finishedAt: 600,
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
    const { campaigns, database, promptApplications, threads } =
      openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const preparer = createReplyPreparer(threads, campaigns, promptApplications);

    const generations = createGenerations(database, preparer, modelResolver(), generationRouter());
    await expect(
      generations.generateReply({
        turnId: started.turn.id,
        configuration: {
          model: { providerId: "missing-provider", modelId: "maker/model" },
        },
      }),
    ).rejects.toThrow('Unknown generation provider "missing-provider".');
    expect(provider.generate).not.toHaveBeenCalled();
    expect(database.select().from(generationTable).all()).toEqual([]);
  });

  it("stops waiting for uncooperative reply preparation when interrupted", async () => {
    const provider = { id: "provider-a", generate: vi.fn(async () => ({ text: "Reply" })) };
    const { database, threads } = openGenerationEnvironment(provider);
    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const prepare = vi.fn(() => new Promise<never>(() => {}));
    const generations = createGenerations(
      database,
      { prepare },
      modelResolver(provider),
      generationRouter(provider),
    );
    const controller = new AbortController();
    const interruption = new Error("Reply preparation interrupted by test.");
    const pending = generations.generateReply({
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
    const { database, generations, threads } = openGenerationEnvironment(provider);
    const missingTurnId = ids.turn.create();

    await expect(
      generations.generateReply({
        turnId: missingTurnId,
        configuration: { model: { providerId: provider.id, modelId: "maker/model" } },
      }),
    ).rejects.toThrow(`Turn "${missingTurnId}" does not exist.`);

    const thread = threads.create();
    const started = threads.startTurn(thread.id, "Hello");
    const malformed = createGenerations(
      database,
      {
        prepare: () => ({
          instructions: [],
          dialogue: [{ messageId: ids.message.create(), role: "user", content: "Hello" }],
        }),
      },
      modelResolver(provider),
      generationRouter(provider),
    );

    await expect(
      malformed.generateReply({
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
