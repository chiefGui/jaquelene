import { describe, expect, it } from "vite-plus/test";
import { ids } from "./id";

const identities = [
  ["scenario", ids.scenario],
  ["campaign", ids.campaign],
  ["thread", ids.thread],
  ["message", ids.message],
  ["generation", ids.generation],
] as const;

describe("IDs", () => {
  it("creates and parses each owned identity", () => {
    for (const [prefix, identity] of identities) {
      const created = identity.create();

      expect(created.startsWith(`${prefix}_`)).toBe(true);
      expect(identity.parse(created)).toBe(created);
    }
  });

  it("rejects malformed and differently prefixed identities", () => {
    expect(() => ids.thread.parse("thread_not-a-typeid")).toThrow("Invalid thread ID.");
    expect(() => ids.campaign.parse(ids.scenario.create())).toThrow("Invalid campaign ID.");
  });
});
