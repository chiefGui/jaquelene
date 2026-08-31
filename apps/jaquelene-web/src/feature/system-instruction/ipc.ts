import { SystemInstructions } from "@jaquelene/ipc/renderer";
import { requireIpcMethod } from "@/ipc";

export const systemInstructionIpc = {
  listGroups: requireIpcMethod(SystemInstructions?.listGroups),
};
