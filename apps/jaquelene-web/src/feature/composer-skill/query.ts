import { ComposerSkills } from "@jaquelene/ipc/renderer";
import { queryOptions } from "@tanstack/react-query";
import { ipcQueryOptions, requireIpcMethod } from "@/ipc";

const listSkills = requireIpcMethod(ComposerSkills?.list);
export const composerSkillTransport = {
  execute: requireIpcMethod(ComposerSkills?.execute),
  cancel: requireIpcMethod(ComposerSkills?.cancel),
};

export const composerSkillsQuery = queryOptions({
  ...ipcQueryOptions,
  queryKey: ["composer-skills"],
  queryFn: () => listSkills(),
});
