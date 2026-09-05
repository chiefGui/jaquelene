export const campaignQueryKey = ["campaigns"] as const;
export const campaignDetailQueryKey = [...campaignQueryKey, "detail"] as const;
export const campaignListQueryKey = [...campaignQueryKey, "list"] as const;
export const campaignUsageQueryKey = ["usage", "campaign"] as const;
export const skillQueryKey = ["skills"] as const;
export const skillSelectionQueryKey = [...skillQueryKey, "selection"] as const;
export const campaignSkillSelectionQueryKey = [...skillSelectionQueryKey, "campaign"] as const;
export const threadQueryKey = ["threads"] as const;
export const usageQueryKey = ["usage"] as const;

export function campaignRecordQueryKey(id: string) {
  return [...campaignDetailQueryKey, id] as const;
}

export function campaignUsageRecordQueryKey(id: string) {
  return [...campaignUsageQueryKey, id] as const;
}

export function campaignSkillSelectionPrefix(campaignId: string) {
  return [...campaignSkillSelectionQueryKey, campaignId] as const;
}

export function threadQueryPrefix(threadId: string) {
  return [...threadQueryKey, threadId] as const;
}
