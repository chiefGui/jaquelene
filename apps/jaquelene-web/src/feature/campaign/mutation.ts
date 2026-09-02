import { campaignQueryKey } from "@/feature/cache-keys";

export function campaignMutationKey(id: string) {
  return [...campaignQueryKey, id, "mutation"] as const;
}

export function campaignMutationScope(id: string) {
  return { id: `campaign:${id}:mutation` } as const;
}
