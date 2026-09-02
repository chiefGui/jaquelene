import { UsageCostSource, type UsageCost } from "@jaquelene/ipc/renderer";

export type CostSummary =
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "single-currency";
      currency: string;
      amountNanos: number;
      estimated: boolean;
    }>
  | Readonly<{ kind: "multiple-currencies"; currencies: readonly string[] }>;

export function summarizeCosts(costs: readonly UsageCost[]): CostSummary {
  const amounts = new Map<string, number>();
  let estimated = false;

  for (const cost of costs) {
    if (!/^[A-Z]{3}$/.test(cost.currency)) {
      throw new TypeError(`Invalid usage cost currency: ${cost.currency}.`);
    }

    const total = (amounts.get(cost.currency) ?? 0) + cost.amountNanos;

    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Usage cost exceeds the supported amount.");
    }

    amounts.set(cost.currency, total);
    estimated ||= cost.source === UsageCostSource.Estimated;
  }

  if (amounts.size === 0) {
    return { kind: "none" };
  }

  if (amounts.size > 1) {
    return { kind: "multiple-currencies", currencies: [...amounts.keys()].sort() };
  }

  const entry = amounts.entries().next();

  if (entry.done) {
    throw new Error("Expected a usage cost summary.");
  }

  const [currency, amountNanos] = entry.value;
  return { kind: "single-currency", currency, amountNanos, estimated };
}
