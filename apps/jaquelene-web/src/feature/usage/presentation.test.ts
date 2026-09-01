import { describe, expect, it } from "vite-plus/test";
import { summarizeCosts } from "./presentation";

describe("usage cost presentation", () => {
  it("combines sources only within one currency", () => {
    expect(
      summarizeCosts([
        {
          currency: "USD",
          source: "provider-reported",
          amountNanos: 10,
          attempts: 1,
        },
        { currency: "USD", source: "estimated", amountNanos: 5, attempts: 1 },
      ]),
    ).toEqual({
      kind: "single-currency",
      currency: "USD",
      amountNanos: 15,
      estimated: true,
    });
  });

  it("keeps unlike currencies separate", () => {
    expect(
      summarizeCosts([
        {
          currency: "USD",
          source: "provider-reported",
          amountNanos: 10,
          attempts: 1,
        },
        {
          currency: "EUR",
          source: "provider-reported",
          amountNanos: 5,
          attempts: 1,
        },
      ]),
    ).toEqual({ kind: "multiple-currencies", currencies: ["EUR", "USD"] });
  });
});
