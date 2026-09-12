import { PlayerResponses } from "@jaquelene/ipc/renderer";
import { queryOptions } from "@tanstack/react-query";
import { ipcQueryOptions, requireIpcMethod } from "@/ipc";

const listSkills = requireIpcMethod(PlayerResponses?.list);
export const playerResponseTransport = {
  execute: requireIpcMethod(PlayerResponses?.execute),
  cancel: requireIpcMethod(PlayerResponses?.cancel),
};

export const playerResponsesQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["player-responses"],
  queryFn: () => listSkills(),
});
