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
  campaign: defineId("campaign"),
  thread: defineId("thread"),
  turn: defineId("turn"),
  message: defineId("message"),
  generation: defineId("generation"),
  providerAttempt: defineId("attempt"),
  skill: defineId("skill"),
} as const;

export type CampaignId = ReturnType<typeof ids.campaign.create>;
export type ThreadId = ReturnType<typeof ids.thread.create>;
export type TurnId = ReturnType<typeof ids.turn.create>;
export type MessageId = ReturnType<typeof ids.message.create>;
export type GenerationId = ReturnType<typeof ids.generation.create>;
export type ProviderAttemptId = ReturnType<typeof ids.providerAttempt.create>;
