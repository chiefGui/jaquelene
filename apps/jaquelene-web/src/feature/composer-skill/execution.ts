import type { SkillId } from "@jaquelene/domain";
import type { ReactionResult } from "@jaquelene/ipc/reaction";
import type { ExecuteReactionRequest, RequestedModelConfiguration } from "@jaquelene/ipc/renderer";
import type { QueryClient } from "@tanstack/react-query";
import { readThreadDraft, replaceThreadDraft, writeThreadDraft } from "@/feature/thread/draft";
import { threadOperationMutationKey } from "@/feature/cache-keys";

type SkillTransport = Readonly<{
  execute: (request: ExecuteReactionRequest) => Promise<ReactionResult>;
  cancel: (requestId: string) => Promise<boolean>;
}>;

export type ComposerSkillDelivery = ReactionResult | { status: "draft-changed" };

export function createComposerSkillExecution(
  queryClient: QueryClient,
  threadId: string,
  transport: SkillTransport,
) {
  let closed = false;
  let active: { requestId: string; cancelled: boolean } | undefined;
  async function cancel() {
    if (!active) return;
    active.cancelled = true;
    await transport.cancel(active.requestId);
  }
  return {
    async execute(
      skillId: SkillId,
      configuration: RequestedModelConfiguration,
    ): Promise<ComposerSkillDelivery> {
      if (closed) return { status: "cancelled" };
      if (active) throw new Error("A composer skill is already running.");
      const operationKey = threadOperationMutationKey(threadId);
      if (queryClient.isMutating({ mutationKey: operationKey })) return { status: "cancelled" };
      const execution = { requestId: crypto.randomUUID(), cancelled: false };
      active = execution;
      let unsubscribe: (() => void) | undefined;
      try {
        const draft = writeThreadDraft(
          queryClient,
          threadId,
          readThreadDraft(queryClient, threadId).content,
        );
        unsubscribe = queryClient.getMutationCache().subscribe(({ mutation }) => {
          const key = mutation?.options.mutationKey;
          if (
            mutation?.state.status === "pending" &&
            key &&
            operationKey.every((part, index) => key[index] === part)
          ) {
            execution.cancelled = true;
          }
        });
        const result = await transport.execute({
          requestId: execution.requestId,
          skillId,
          threadId,
          configuration,
        });
        if (result.status !== "completed") return result;
        if (execution.cancelled) return { status: "cancelled" };
        if (!replaceThreadDraft(queryClient, threadId, draft, result.text))
          return { status: "draft-changed" };
        return result;
      } finally {
        unsubscribe?.();
        active = undefined;
      }
    },
    cancel,
    open() {
      closed = false;
    },
    close() {
      closed = true;
      return cancel();
    },
  };
}
