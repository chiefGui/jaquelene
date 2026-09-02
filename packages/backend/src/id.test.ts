import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import {
  ids,
  type CampaignId,
  type GenerationId,
  type MessageId,
  type InstructionId,
  type ScenarioId,
  type ThreadId,
  type TurnId,
} from "./id";

const identities = [
  ["scenario", ids.scenario],
  ["campaign", ids.campaign],
  ["thread", ids.thread],
  ["turn", ids.turn],
  ["message", ids.message],
  ["generation", ids.generation],
  ["instruction", ids.instruction],
] as const;

describe("IDs", () => {
  it("creates and parses each owned identity", () => {
    for (const [prefix, identity] of identities) {
      const created = identity.create();

      expect(created.startsWith(`${prefix}_`)).toBe(true);
      expect(identity.parse(created)).toBe(created);
    }
  });

  it("keeps owned identity types non-interchangeable", () => {
    expectTypeOf<ScenarioId>().not.toExtend<CampaignId>();
    expectTypeOf<CampaignId>().not.toExtend<ThreadId>();
    expectTypeOf<ThreadId>().not.toExtend<TurnId>();
    expectTypeOf<TurnId>().not.toExtend<MessageId>();
    expectTypeOf<MessageId>().not.toExtend<GenerationId>();
    expectTypeOf<GenerationId>().not.toExtend<ScenarioId>();
    expectTypeOf<InstructionId>().not.toExtend<ScenarioId>();
  });

  it("rejects malformed and differently prefixed identities", () => {
    const created = identities.map(([prefix, identity]) => [prefix, identity.create()] as const);

    for (const [prefix, identity] of identities) {
      const parseMalformed = () => identity.parse(`${prefix}_not-a-typeid`);

      expect(parseMalformed).toThrow(TypeError);
      expect(parseMalformed).toThrow(`Invalid ${prefix} ID.`);

      for (const [otherPrefix, otherId] of created) {
        if (otherPrefix === prefix) {
          continue;
        }

        const parseOtherIdentity = () => identity.parse(otherId);

        expect(parseOtherIdentity).toThrow(TypeError);
        expect(parseOtherIdentity).toThrow(`Invalid ${prefix} ID.`);
      }
    }
  });
});
