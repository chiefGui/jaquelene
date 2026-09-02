export const campaignQueryKey = ["campaigns"] as const;
export const campaignListQueryKey = [...campaignQueryKey, "list"] as const;
export const campaignUsageQueryKey = ["usage", "campaign"] as const;
export const promptQueryKey = ["prompts"] as const;
export const campaignPromptSelectionQueryKey = [...promptQueryKey, "campaign-selection"] as const;
export const threadQueryKey = ["threads"] as const;
export const usageQueryKey = ["usage"] as const;

export function campaignRecordQueryKey(id: string) {
  return [...campaignQueryKey, id] as const;
}

export function campaignUsageRecordQueryKey(id: string) {
  return [...campaignUsageQueryKey, id] as const;
}

export function campaignPromptSelectionPrefix(campaignId: string) {
  return [...campaignPromptSelectionQueryKey, campaignId] as const;
}

export function threadQueryPrefix(threadId: string) {
  return [...threadQueryKey, threadId] as const;
}
