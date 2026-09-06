import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import {
  readCampaignSetupDraft,
  subscribeToCampaignSetupDraft,
  writeCampaignSetupDraft,
  type CampaignSetupDraft,
} from "./setup-draft";

export function useCampaignSetupDraft() {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => subscribeToCampaignSetupDraft(queryClient, onChange),
    [queryClient],
  );
  const getSnapshot = useCallback(() => readCampaignSetupDraft(queryClient), [queryClient]);
  const draft = useSyncExternalStore(subscribe, getSnapshot);
  const updateDraft = useCallback(
    (patch: Partial<CampaignSetupDraft>) => writeCampaignSetupDraft(queryClient, patch),
    [queryClient],
  );
  return { draft, updateDraft };
}
