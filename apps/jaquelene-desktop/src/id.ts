import { fromString, typeidUnboxed } from "typeid-js";

function defineId<const Prefix extends string>(prefix: Prefix) {
  return {
    create() {
      return typeidUnboxed(prefix);
    },

    parse(value: string) {
      try {
        return fromString(value, prefix);
      } catch (cause) {
        throw new TypeError(`Invalid ${prefix} ID.`, { cause });
      }
    },
  };
}

export const ids = {
  scenario: defineId("scenario"),
  campaign: defineId("campaign"),
  thread: defineId("thread"),
  turn: defineId("turn"),
  message: defineId("message"),
  generation: defineId("generation"),
} as const;

export type ScenarioId = ReturnType<typeof ids.scenario.create>;
export type CampaignId = ReturnType<typeof ids.campaign.create>;
export type ThreadId = ReturnType<typeof ids.thread.create>;
export type TurnId = ReturnType<typeof ids.turn.create>;
export type MessageId = ReturnType<typeof ids.message.create>;
export type GenerationId = ReturnType<typeof ids.generation.create>;
