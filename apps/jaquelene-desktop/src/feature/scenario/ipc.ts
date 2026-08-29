import { ids, type Scenarios } from "@jaquelene/backend";
import { Scenarios as ScenariosIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

export function exposeScenarios(target: WebFrameMain, scenarios: Scenarios) {
  ScenariosIpc.for(target).setImplementation({
    create: scenarios.create,
    list: scenarios.list,
    get(id) {
      return scenarios.get(ids.scenario.parse(id));
    },
    rename(id, title) {
      return scenarios.rename(ids.scenario.parse(id), title);
    },
  });
}
