import { QueryClient } from "@tanstack/react-query";
import { skillIdSchema } from "@jaquelene/domain";
import type { ReactionResult } from "@jaquelene/ipc/reaction";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ExecuteReactionRequest } from "@jaquelene/ipc/renderer";
import { threadQueryPrefix, threadOperationMutationKey } from "@/feature/cache-keys";
import { readThreadDraft, writeThreadDraft } from "@/feature/thread/draft";
import { createComposerSkillExecution } from "./execution";

const skillId = skillIdSchema.parse("friendly-reaction");
const configuration = { model: { providerId: "provider", modelId: "campaign-model" } };

function environment() {
  const client = new QueryClient();
  const response = Promise.withResolvers<ReactionResult>();
  const transport = {
    execute: vi.fn((_request: ExecuteReactionRequest) => response.promise),
    cancel: vi.fn(async (_requestId: string) => true),
  };
  const execution = createComposerSkillExecution(client, "thread", transport);
  return { client, response, transport, execution };
}

describe("composer skill delivery", () => {
  it("does not start queued work after its composer has closed, and can reopen", async () => {
    const env = environment();
    await env.execution.close();
    expect(await env.execution.execute(skillId, configuration)).toEqual({ status: "cancelled" });
    expect(env.transport.execute).not.toHaveBeenCalled();
    env.execution.open();
    env.response.resolve({ status: "completed", text: "Reopened" });
    expect((await env.execution.execute(skillId, configuration)).status).toBe("completed");
    env.client.clear();
  });

  it("rejects delivery as soon as a history operation starts, even before a render", async () => {
    const env = environment();
    const running = env.execution.execute(skillId, configuration);
    const mutation = env.client.getMutationCache().build(env.client, {
      mutationKey: [...threadOperationMutationKey("thread"), "edit"],
      mutationFn: async () => {},
    });
    await mutation.execute(undefined);
    env.response.resolve({ status: "completed", text: "Stale" });
    expect(await running).toEqual({ status: "cancelled" });
    expect(readThreadDraft(env.client, "thread").content).toBe("");
    env.client.clear();
  });
  it("fills an untouched empty composer", async () => {
    const env = environment();
    const running = env.execution.execute(skillId, configuration);
    env.response.resolve({ status: "completed", text: "Friendly draft" });
    expect(await running).toEqual({ status: "completed", text: "Friendly draft" });
    expect(readThreadDraft(env.client, "thread").content).toBe("Friendly draft");
    env.client.clear();
  });

  it("keeps confirmed text until a successful response arrives", async () => {
    const env = environment();
    writeThreadDraft(env.client, "thread", "Existing draft");
    const running = env.execution.execute(skillId, configuration);
    expect(readThreadDraft(env.client, "thread").content).toBe("Existing draft");
    env.response.resolve({ status: "failed", message: "Failed" });
    await running;
    expect(readThreadDraft(env.client, "thread").content).toBe("Existing draft");
    env.client.clear();
  });

  it.each(["New text", ""])(
    "preserves subsequent edits including clearing: %j",
    async (content) => {
      const env = environment();
      const running = env.execution.execute(skillId, configuration);
      writeThreadDraft(env.client, "thread", content);
      env.response.resolve({ status: "completed", text: "Generated draft" });
      expect(await running).toEqual({ status: "draft-changed" });
      expect(readThreadDraft(env.client, "thread").content).toBe(content);
      env.client.clear();
    },
  );

  it("does not resurrect a removed draft", async () => {
    const env = environment();
    const running = env.execution.execute(skillId, configuration);
    env.client.removeQueries({ queryKey: threadQueryPrefix("thread") });
    env.response.resolve({ status: "completed", text: "Generated draft" });
    expect(await running).toEqual({ status: "draft-changed" });
    expect(env.client.getQueryCache().getAll()).toEqual([]);
  });

  it("cancels before acknowledgment, ignores late completion, and permits another run", async () => {
    const env = environment();
    const running = env.execution.execute(skillId, configuration);
    await env.execution.cancel();
    expect(env.transport.cancel).toHaveBeenCalledWith(
      env.transport.execute.mock.calls[0]?.[0]?.requestId,
    );
    env.response.resolve({ status: "completed", text: "Late text" });
    expect(await running).toEqual({ status: "cancelled" });
    expect(readThreadDraft(env.client, "thread").content).toBe("");
    expect((await env.execution.execute(skillId, configuration)).status).toBe("completed");
    env.client.clear();
  });

  it("preserves a failure reported while cancelling without changing the draft", async () => {
    const env = environment();
    writeThreadDraft(env.client, "thread", "Existing draft");
    const running = env.execution.execute(skillId, configuration);
    await env.execution.cancel();
    const failure = { status: "failed", message: "Usage could not be settled." } as const;
    env.response.resolve(failure);
    expect(await running).toEqual(failure);
    expect(readThreadDraft(env.client, "thread").content).toBe("Existing draft");
    env.client.clear();
  });
});
