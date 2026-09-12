import { Reactions } from "@jaquelene/ipc/renderer";
import { queryOptions } from "@tanstack/react-query";
import { ipcQueryOptions, requireIpcMethod } from "@/ipc";

const listSkills = requireIpcMethod(Reactions?.list);
export const reactionTransport = {
  execute: requireIpcMethod(Reactions?.execute),
  cancel: requireIpcMethod(Reactions?.cancel),
};

export const reactionsQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["reactions"],
  queryFn: () => listSkills(),
});
