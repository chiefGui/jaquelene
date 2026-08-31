import { queryOptions } from "@tanstack/react-query";
import { ipcQueryOptions } from "@/ipc";
import { systemInstructionIpc } from "./ipc";

export const systemInstructionGroupsQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["system-instructions"],
  queryFn: systemInstructionIpc.listGroups,
});
