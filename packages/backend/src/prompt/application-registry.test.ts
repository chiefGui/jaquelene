import { parsePromptKindKey, type PromptKindKey } from "@jaquelene/domain";
import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import { createPromptApplicationRegistry, type PromptApplication } from "./application-registry";

const narratorPromptKind = parsePromptKindKey("narrator");

function application(kind: PromptKindKey = narratorPromptKind): PromptApplication {
  return {
    kind,
    apply: ({ campaign }) =>
      campaign ? [{ key: `factory.${kind}.default`, content: `${kind} content` }] : [],
  };
}

describe("prompt application registry", () => {
  it("applies registered prompt kinds in deterministic order", () => {
    const registry = createPromptApplicationRegistry([
      application(),
      application(parsePromptKindKey("setting")),
    ]);

    expect(
      registry.resolve({
        threadId: ids.thread.create(),
        campaign: { id: ids.campaign.create() },
      }),
    ).toEqual([
      { sourceKey: "factory.narrator.default", content: "narrator content" },
      { sourceKey: "factory.setting.default", content: "setting content" },
    ]);
  });

  it("does not apply campaign prompts to standalone threads", () => {
    const registry = createPromptApplicationRegistry([application()]);
    expect(registry.resolve({ threadId: ids.thread.create(), campaign: null })).toEqual([]);
  });

  it("rejects multiple applications for one prompt kind", () => {
    expect(() => createPromptApplicationRegistry([application(), application()])).toThrow(
      'Prompt kind "narrator" has multiple applications.',
    );
  });
});
