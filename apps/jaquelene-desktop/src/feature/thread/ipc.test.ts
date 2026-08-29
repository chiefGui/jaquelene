import type { Generation, Turns, TurnSubmission } from "@jaquelene/backend";
import { ids } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import type { IThreadsImpl, ITurnsImpl } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import { describe, expect, it, vi } from "vite-plus/test";

const implementations = vi.hoisted(() => ({
  threads: undefined as IThreadsImpl | undefined,
  turns: undefined as ITurnsImpl | undefined,
}));

vi.mock("@jaquelene/ipc/main", () => ({
  GenerationFailureKind: {
    Prompt: "prompt",
    Provider: "provider",
    InvalidOutput: "invalid-output",
    Interrupted: "interrupted",
    Storage: "storage",
  },
  GenerationStatus: {
    Pending: "pending",
    Completed: "completed",
    Failed: "failed",
  },
  ThreadMessageAuthor: { User: "user", Assistant: "assistant" },
  Threads: {
    for: () => ({
      setImplementation(implementation: IThreadsImpl) {
        implementations.threads = implementation;
      },
    }),
  },
  Turns: {
    for: () => ({
      setImplementation(implementation: ITurnsImpl) {
        implementations.turns = implementation;
      },
    }),
  },
}));

import { exposeThreadMessaging } from "./ipc";

function requireImplementations() {
  if (!implementations.threads || !implementations.turns) {
    throw new Error("Thread IPC implementations were not registered.");
  }

  return { threads: implementations.threads, turns: implementations.turns };
}

function createFailedSubmission(
  failureKind: NonNullable<Generation["failureKind"]>,
  cause: unknown,
): TurnSubmission {
  const threadId = ids.thread.create();
  const turnId = ids.turn.create();

  return {
    turn: { id: turnId, threadId, createdAt: 100 },
    userMessage: {
      id: ids.message.create(),
      threadId,
      turnId,
      parentMessageId: null,
      sequence: 1,
      author: "user",
      content: "Hello",
      createdAt: 100,
    },
    generation: {
      id: ids.generation.create(),
      turnId,
      providerId: "openrouter",
      modelId: "maker/model",
      status: "failed",
      failureKind,
      providerGenerationId: null,
      resolvedModelId: null,
      finishReason: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      outputMessageId: null,
      startedAt: 101,
      finishedAt: 102,
    },
    assistantMessage: null,
    assistantActivated: false,
    failure: { cause },
  };
}

describe("thread IPC", () => {
  it("maps durable turn activity and parses transport identities", async () => {
    const threadId = ids.thread.create();
    const turnId = ids.turn.create();
    const userMessageId = ids.message.create();
    const assistantMessageId = ids.message.create();
    const failedGeneration: Generation = {
      id: ids.generation.create(),
      turnId,
      providerId: "openrouter",
      modelId: "maker/model",
      status: "failed",
      failureKind: "provider",
      providerGenerationId: null,
      resolvedModelId: null,
      finishReason: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      outputMessageId: null,
      startedAt: 101,
      finishedAt: 102,
    };
    const completedGeneration: Generation = {
      ...failedGeneration,
      id: ids.generation.create(),
      status: "completed",
      failureKind: null,
      outputMessageId: assistantMessageId,
      startedAt: 103,
      finishedAt: 104,
    };
    const turn = { id: turnId, threadId, createdAt: 100 };
    const userMessage = {
      id: userMessageId,
      threadId,
      turnId,
      parentMessageId: null,
      sequence: 1,
      author: "user" as const,
      content: "Hello",
      createdAt: 100,
    };
    const assistantMessage = {
      id: assistantMessageId,
      threadId,
      turnId,
      parentMessageId: userMessageId,
      sequence: 2,
      author: "assistant" as const,
      content: "Hi",
      createdAt: 104,
    };
    const completedSubmission: TurnSubmission = {
      turn,
      userMessage,
      generation: completedGeneration,
      assistantMessage,
      assistantActivated: true,
      failure: null,
    };
    const providerFailure = new Error("Provider unavailable");
    const failedSubmission: TurnSubmission = {
      turn,
      userMessage,
      generation: failedGeneration,
      assistantMessage: null,
      assistantActivated: false,
      failure: { cause: providerFailure },
    };
    const backendTurns: Turns = {
      listForThread: vi.fn(() => ({
        messages: [userMessage],
        generations: [failedGeneration],
        pageSize: 50,
        messageContentMaxLength: 100_000,
      })),
      submit: vi.fn(async () => completedSubmission),
      retry: vi.fn(async () => failedSubmission),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeThreadMessaging({} as WebFrameMain, backendTurns, { report });
    const ipc = requireImplementations();
    const page = await ipc.threads.listMessages({ threadId });

    expect(backendTurns.listForThread).toHaveBeenCalledWith({ threadId });
    expect(page).toEqual({
      messages: [
        {
          id: userMessageId,
          threadId,
          turnId,
          sequence: 1,
          author: "user",
          content: "Hello",
          createdAt: 100,
        },
      ],
      generations: [
        {
          id: failedGeneration.id,
          turnId,
          providerId: "openrouter",
          modelId: "maker/model",
          status: "failed",
          failureKind: "provider",
          startedAt: 101,
          finishedAt: 102,
        },
      ],
      pageSize: 50,
      messageContentMaxLength: 100_000,
    });

    const model = { providerId: "openrouter", modelId: "maker/model" };
    const submitted = await ipc.turns.submit({ threadId, content: "Hello", model });
    const retried = await ipc.turns.retry({ turnId, model });

    expect(backendTurns.submit).toHaveBeenCalledWith({ threadId, content: "Hello", model });
    expect(backendTurns.retry).toHaveBeenCalledWith({ turnId, model });
    expect(submitted).toEqual({
      turn,
      userMessage: page.messages[0],
      generation: {
        id: completedGeneration.id,
        turnId,
        providerId: "openrouter",
        modelId: "maker/model",
        status: "completed",
        outputMessageId: assistantMessageId,
        startedAt: 103,
        finishedAt: 104,
      },
      assistantMessage: {
        id: assistantMessageId,
        threadId,
        turnId,
        sequence: 2,
        author: "assistant",
        content: "Hi",
        createdAt: 104,
      },
      assistantActivated: true,
    });
    expect(retried).toEqual({
      turn,
      userMessage: page.messages[0],
      generation: page.generations[0],
      assistantActivated: false,
    });
    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    ["prompt", "prompt compilation"],
    ["invalid-output", "provider output validation"],
    ["storage", "reply storage"],
  ] as const)("reports durable %s failures with their cause", async (failureKind, stage) => {
    const cause = new Error(`${failureKind} failed`);
    const submission = createFailedSubmission(failureKind, cause);
    const backendTurns: Turns = {
      listForThread: vi.fn(() => ({
        messages: [],
        generations: [],
        pageSize: 50,
        messageContentMaxLength: 100_000,
      })),
      submit: vi.fn(async () => submission),
      retry: vi.fn(),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeThreadMessaging({} as WebFrameMain, backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: submission.turn.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith({
      severity: ErrorSeverity.Error,
      operation: "thread.turn.submit",
      error: expect.objectContaining({ message: `Generation failed during ${stage}.`, cause }),
    });
  });

  it("labels unexpected retry failures as retry operations", async () => {
    const cause = new Error("Prompt compilation failed");
    const submission = createFailedSubmission("prompt", cause);
    const backendTurns: Turns = {
      listForThread: vi.fn(() => ({
        messages: [],
        generations: [],
        pageSize: 50,
        messageContentMaxLength: 100_000,
      })),
      submit: vi.fn(),
      retry: vi.fn(async () => submission),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeThreadMessaging({} as WebFrameMain, backendTurns, { report });
    await requireImplementations().turns.retry({
      turnId: submission.turn.id,
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "thread.turn.retry" }),
    );
  });

  it("does not diagnose an interrupted generation as an application failure", async () => {
    const submission = createFailedSubmission("interrupted", new Error("Backend is closing"));
    const backendTurns: Turns = {
      listForThread: vi.fn(() => ({
        messages: [],
        generations: [],
        pageSize: 50,
        messageContentMaxLength: 100_000,
      })),
      submit: vi.fn(async () => submission),
      retry: vi.fn(),
    };
    const report = vi.fn<ErrorReporter["report"]>();

    exposeThreadMessaging({} as WebFrameMain, backendTurns, { report });
    await requireImplementations().turns.submit({
      threadId: submission.turn.threadId,
      content: "Hello",
      model: { providerId: "openrouter", modelId: "maker/model" },
    });

    expect(report).not.toHaveBeenCalled();
  });

  it("rejects malformed TypeIDs at the adapter boundary", async () => {
    const backendTurns: Turns = {
      listForThread: vi.fn(() => ({
        messages: [],
        generations: [],
        pageSize: 50,
        messageContentMaxLength: 100_000,
      })),
      submit: vi.fn(),
      retry: vi.fn(),
    };
    exposeThreadMessaging({} as WebFrameMain, backendTurns, { report: vi.fn() });
    const ipc = requireImplementations();
    const model = { providerId: "openrouter", modelId: "maker/model" };

    expect(() => ipc.threads.listMessages({ threadId: "invalid" })).toThrow(TypeError);
    await expect(
      ipc.turns.submit({ threadId: "invalid", content: "Hello", model }),
    ).rejects.toThrow(TypeError);
    await expect(ipc.turns.retry({ turnId: "invalid", model })).rejects.toThrow(TypeError);
    expect(backendTurns.listForThread).not.toHaveBeenCalled();
    expect(backendTurns.submit).not.toHaveBeenCalled();
    expect(backendTurns.retry).not.toHaveBeenCalled();
  });
});
