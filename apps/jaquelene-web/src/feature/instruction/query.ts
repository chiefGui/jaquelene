import { queryOptions } from "@tanstack/react-query";
import { ipcQueryOptions } from "@/ipc";
import { instructionIpc } from "./ipc";

export const instructionGroupsQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["instructions"],
  queryFn: instructionIpc.listGroups,
});
