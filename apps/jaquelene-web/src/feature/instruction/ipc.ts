import { Instructions } from "@jaquelene/ipc/renderer";
import { requireIpcMethod } from "@/ipc";

export const instructionIpc = {
  listGroups: requireIpcMethod(Instructions?.listGroups),
};
