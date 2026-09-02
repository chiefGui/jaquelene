import { Prompts } from "@jaquelene/ipc/renderer";
import { requireIpcMethod } from "@/ipc";

export const promptIpc = {
  listKinds: requireIpcMethod(Prompts?.listKinds),
  list: requireIpcMethod(Prompts?.list),
  get: requireIpcMethod(Prompts?.get),
  create: requireIpcMethod(Prompts?.create),
  update: requireIpcMethod(Prompts?.update),
  delete: requireIpcMethod(Prompts?.delete),
  getDefault: requireIpcMethod(Prompts?.getDefault),
  setDefault: requireIpcMethod(Prompts?.setDefault),
  getCampaignSelection: requireIpcMethod(Prompts?.getCampaignSelection),
  setCampaignSelection: requireIpcMethod(Prompts?.setCampaignSelection),
};
