import { Campaigns as CampaignsIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { Campaigns } from "./campaigns";

export function exposeCampaigns(target: WebFrameMain, campaigns: Campaigns) {
  CampaignsIpc.for(target).setImplementation(campaigns);
}
