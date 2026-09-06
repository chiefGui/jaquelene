import { describe, expect, it, vi } from "vite-plus/test";
import { ids } from "#backend/id";
import { createModelInputResolver } from "./input-resolver";

describe("model input resolver", () => {
  it("appends the campaign scenario after reusable instructions without changing dialogue", () => {
    const threadId = ids.thread.create();
    const campaign = { id: ids.campaign.create(), scenario: "A city beneath the sea." };
    const resolver = createModelInputResolver(
      { getContextForThread: () => campaign },
      { resolve: () => [{ sourceKey: "narrator", content: "Narrate clearly." }] },
    );
    expect(resolver.resolve({ threadId, messages: [] })).toEqual({
      instructions: [
        { sourceKey: "narrator", content: "Narrate clearly." },
        {
          sourceKey: `campaign.${campaign.id}.scenario`,
          content: "## Scenario\nA city beneath the sea.",
        },
      ],
      dialogue: [],
    });
  });

  it("leaves standalone threads without campaign instructions", () => {
    const resolver = createModelInputResolver(
      { getContextForThread: () => null },
      { resolve: () => [] },
    );
    expect(resolver.resolve({ threadId: ids.thread.create(), messages: [] }).instructions).toEqual(
      [],
    );
  });

  it("combines resolved thread instructions with dialogue in order", () => {
    const threadId = ids.thread.create();
    const campaign = { id: ids.campaign.create(), scenario: "" };
    const messages = [
      { id: ids.message.create(), author: "user" as const, content: "Hello" },
      { id: ids.message.create(), author: "assistant" as const, content: "Hi" },
    ];
    const getContextForThread = vi.fn(() => campaign);
    const resolve = vi.fn(() => [{ sourceKey: "narrator", content: "Narrate clearly." }]);
    const resolver = createModelInputResolver({ getContextForThread }, { resolve });

    expect(resolver.resolve({ threadId, messages })).toEqual({
      instructions: [{ sourceKey: "narrator", content: "Narrate clearly." }],
      dialogue: [
        { messageId: messages[0]!.id, role: "user", content: "Hello" },
        { messageId: messages[1]!.id, role: "assistant", content: "Hi" },
      ],
    });
    expect(getContextForThread).toHaveBeenCalledWith(threadId);
    expect(resolve).toHaveBeenCalledWith({ threadId, campaign });
  });
});
