import type {
  Usage as BackendUsage,
  UsageOverview as BackendUsageOverview,
} from "@jaquelene/backend";
import {
  UsageBucketGranularity,
  UsageCostSource,
  UsagePeriod,
  Usage as UsageIpc,
  type UsageOverview as IpcUsageOverview,
} from "@jaquelene/ipc/main";
import type { WebContents } from "electron";

function fromIpcPeriod(period: UsagePeriod) {
  switch (period) {
    case UsagePeriod.Last7Days:
      return "last-7-days" as const;
    case UsagePeriod.Last30Days:
      return "last-30-days" as const;
    case UsagePeriod.Last90Days:
      return "last-90-days" as const;
    case UsagePeriod.AllTime:
      return "all-time" as const;
  }
}

function toIpcPeriod(period: BackendUsageOverview["period"]) {
  switch (period) {
    case "last-7-days":
      return UsagePeriod.Last7Days;
    case "last-30-days":
      return UsagePeriod.Last30Days;
    case "last-90-days":
      return UsagePeriod.Last90Days;
    case "all-time":
      return UsagePeriod.AllTime;
  }
}

function toIpcGranularity(granularity: BackendUsageOverview["granularity"]) {
  switch (granularity) {
    case "day":
      return UsageBucketGranularity.Day;
    case "week":
      return UsageBucketGranularity.Week;
    case "month":
      return UsageBucketGranularity.Month;
    case "quarter":
      return UsageBucketGranularity.Quarter;
    case "year":
      return UsageBucketGranularity.Year;
  }
}

function toIpcCostSource(source: BackendUsageOverview["costs"][number]["source"]) {
  switch (source) {
    case "provider-reported":
      return UsageCostSource.ProviderReported;
    case "estimated":
      return UsageCostSource.Estimated;
  }
}

function toIpcCosts(costs: BackendUsageOverview["costs"]) {
  return costs.map((cost) => ({ ...cost, source: toIpcCostSource(cost.source) }));
}

function toIpcOverview(overview: BackendUsageOverview): IpcUsageOverview {
  return {
    ...overview,
    period: toIpcPeriod(overview.period),
    granularity: toIpcGranularity(overview.granularity),
    costs: toIpcCosts(overview.costs),
    buckets: overview.buckets.map((bucket) => ({
      ...bucket,
      costs: toIpcCosts(bucket.costs),
    })),
  };
}

export function exposeUsage(target: WebContents, usage: BackendUsage) {
  const dispatcher = UsageIpc.for(target.mainFrame).setImplementation({
    getOverview: (period) => toIpcOverview(usage.getOverview(fromIpcPeriod(period))),
    clear: usage.clear,
  });
  const unsubscribe = usage.subscribe(() => {
    if (!target.isDestroyed()) {
      dispatcher.dispatchChanged();
    }
  });
  let installed = true;
  const dispose = () => {
    if (!installed) {
      return;
    }

    installed = false;
    target.off("destroyed", dispose);
    unsubscribe();
  };

  target.once("destroyed", dispose);
  return dispose;
}
