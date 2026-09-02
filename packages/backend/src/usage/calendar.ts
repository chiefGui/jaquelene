export const usagePeriods = ["last-7-days", "last-30-days", "last-90-days", "all-time"] as const;
export type UsagePeriod = (typeof usagePeriods)[number];

export const usageBucketGranularities = ["day", "week", "month", "quarter", "year"] as const;
export type UsageBucketGranularity = (typeof usageBucketGranularities)[number];

export type UsageTimeBucket = Readonly<{
  startsAt: number;
  endsAt: number;
}>;

export type UsageTimeRange = Readonly<{
  period: UsagePeriod;
  granularity: UsageBucketGranularity;
  startsAt: number;
  endsAt: number;
  buckets: readonly UsageTimeBucket[];
}>;

const maximumBuckets = 48;

function requireTimestamp(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Usage ${field} must be a non-negative timestamp.`);
  }

  return value;
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function startOfMonth(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function startOfQuarter(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1).getTime();
}

function startOfYear(timestamp: number) {
  return new Date(new Date(timestamp).getFullYear(), 0, 1).getTime();
}

function addCalendar(timestamp: number, granularity: UsageBucketGranularity, step = 1) {
  const date = new Date(timestamp);

  switch (granularity) {
    case "day":
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + step).getTime();
    case "week":
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + step * 7).getTime();
    case "month":
      return new Date(date.getFullYear(), date.getMonth() + step, 1).getTime();
    case "quarter":
      return new Date(date.getFullYear(), date.getMonth() + step * 3, 1).getTime();
    case "year":
      return new Date(date.getFullYear() + step, 0, 1).getTime();
  }
}

function calendarMonthCount(startsAt: number, endsAt: number) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
}

function selectAllTimeGranularity(startsAt: number, endsAt: number) {
  const approximateDays = Math.ceil((endsAt - startsAt) / 86_400_000);

  if (approximateDays <= maximumBuckets) {
    return { granularity: "day" as const, step: 1, alignedStart: startOfDay(startsAt) };
  }

  if (approximateDays <= maximumBuckets * 7) {
    return { granularity: "week" as const, step: 1, alignedStart: startOfDay(startsAt) };
  }

  const months = calendarMonthCount(startsAt, endsAt);

  if (months <= maximumBuckets) {
    return { granularity: "month" as const, step: 1, alignedStart: startOfMonth(startsAt) };
  }

  const quarters = Math.ceil(months / 3);

  if (quarters <= maximumBuckets) {
    return { granularity: "quarter" as const, step: 1, alignedStart: startOfQuarter(startsAt) };
  }

  const years = new Date(endsAt).getFullYear() - new Date(startsAt).getFullYear() + 1;
  return {
    granularity: "year" as const,
    step: Math.max(1, Math.ceil(years / maximumBuckets)),
    alignedStart: startOfYear(startsAt),
  };
}

function createBuckets(
  startsAt: number,
  endsAt: number,
  granularity: UsageBucketGranularity,
  step = 1,
) {
  const buckets: UsageTimeBucket[] = [];
  let cursor = startsAt;

  while (cursor < endsAt) {
    const next = Math.min(endsAt, addCalendar(cursor, granularity, step));

    if (next <= cursor) {
      throw new RangeError("Usage calendar did not advance.");
    }

    buckets.push({ startsAt: cursor, endsAt: next });
    cursor = next;

    if (buckets.length > maximumBuckets) {
      throw new RangeError("Usage range exceeds the supported bucket count.");
    }
  }

  return buckets;
}

export function createUsageTimeRange(
  period: UsagePeriod,
  earliestAttemptAt: number | null,
  currentTime: number,
): UsageTimeRange {
  const inclusiveCurrentTime = requireTimestamp(currentTime, "current time");

  if (inclusiveCurrentTime === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Usage current time exceeds the supported range.");
  }

  const endsAt = inclusiveCurrentTime + 1;
  const currentDay = startOfDay(inclusiveCurrentTime);
  let startsAt: number;
  let granularity: UsageBucketGranularity;
  let step = 1;

  switch (period) {
    case "last-7-days":
      startsAt = addCalendar(currentDay, "day", -6);
      granularity = "day";
      break;
    case "last-30-days":
      startsAt = addCalendar(currentDay, "day", -29);
      granularity = "day";
      break;
    case "last-90-days":
      startsAt = addCalendar(currentDay, "day", -89);
      granularity = "week";
      break;
    case "all-time": {
      const earliest =
        earliestAttemptAt === null
          ? currentDay
          : requireTimestamp(earliestAttemptAt, "earliest attempt");
      const selection = selectAllTimeGranularity(Math.min(earliest, endsAt), endsAt);
      startsAt = selection.alignedStart;
      granularity = selection.granularity;
      step = selection.step;
      break;
    }
  }

  startsAt = Math.max(0, startsAt);
  const buckets = createBuckets(startsAt, endsAt, granularity, step);

  return { period, granularity, startsAt, endsAt, buckets };
}

export const usageMaximumBucketCount = maximumBuckets;
