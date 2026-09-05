import { parseSkillKindKey, type SkillKindKey } from "@jaquelene/domain";
import { describe, expect, it } from "vite-plus/test";
import { ids } from "#backend/id";
import {
  createCampaignInstructionRegistry,
  type CampaignInstructionApplication,
} from "./instructions";

const primarySkillKind = parseSkillKindKey("primary");

function application(kind: SkillKindKey = primarySkillKind): CampaignInstructionApplication {
  return {
    kind,
    apply: ({ campaign }) => {
      if (!campaign) return [];
      return [{ sourceKey: `builtin.${kind}.default`, content: `${kind} content` }];
    },
  };
}

describe("campaign instructions", () => {
  it("applies registered skill kinds in deterministic order", () => {
    const registry = createCampaignInstructionRegistry([
      application(),
      application(parseSkillKindKey("setting")),
    ]);

    expect(
      registry.resolve({
        threadId: ids.thread.create(),
        campaign: { id: ids.campaign.create() },
      }),
    ).toEqual([
      { sourceKey: "builtin.primary.default", content: "primary content" },
      { sourceKey: "builtin.setting.default", content: "setting content" },
    ]);
  });

  it("does not apply campaign skills to standalone threads", () => {
    const registry = createCampaignInstructionRegistry([application()]);
    expect(registry.resolve({ threadId: ids.thread.create(), campaign: null })).toEqual([]);
  });

  it("rejects multiple applications for one skill kind", () => {
    expect(() => createCampaignInstructionRegistry([application(), application()])).toThrow(
      'Skill kind "primary" has multiple campaign applications.',
    );
  });
});
