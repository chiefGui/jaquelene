import { describe, expect, it } from "vite-plus/test";
import { createUsageTimeRange, usageMaximumBucketCount } from "./calendar";

describe("usage calendar", () => {
  it("creates contiguous local-calendar buckets for fixed periods", () => {
    const now = new Date(2026, 8, 1, 12, 30).getTime();
    const range = createUsageTimeRange("last-30-days", null, now);

    expect(range.granularity).toBe("day");
    expect(range.buckets).toHaveLength(30);
    expect(range.endsAt).toBe(now + 1);
    expect(new Date(range.startsAt).getHours()).toBe(0);

    for (let index = 1; index < range.buckets.length; index += 1) {
      expect(range.buckets[index]!.startsAt).toBe(range.buckets[index - 1]!.endsAt);
    }
  });

  it("adapts all-time granularity without returning an unbounded series", () => {
    const now = new Date(2060, 8, 1, 12).getTime();
    const earliest = new Date(1970, 0, 1).getTime();
    const range = createUsageTimeRange("all-time", earliest, now);

    expect(range.granularity).toBe("year");
    expect(range.buckets.length).toBeLessThanOrEqual(usageMaximumBucketCount);
    expect(range.buckets[0]!.startsAt).toBeLessThanOrEqual(earliest);
    expect(range.buckets.at(-1)!.endsAt).toBe(now + 1);
  });

  it("never derives local days through fixed 24-hour arithmetic", () => {
    const now = new Date(2026, 2, 31, 12).getTime();
    const range = createUsageTimeRange("last-7-days", null, now);

    for (const bucket of range.buckets.slice(0, -1)) {
      const start = new Date(bucket.startsAt);
      const end = new Date(bucket.endsAt);
      expect(start.getHours()).toBe(0);
      expect(end.getHours()).toBe(0);
      expect(end.getDate()).toBe(
        new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getDate(),
      );
    }
  });
});
