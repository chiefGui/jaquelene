import { Scenarios as ScenariosIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { Scenarios } from "./scenarios";

export function exposeScenarios(target: WebFrameMain, scenarios: Scenarios) {
  ScenariosIpc.for(target).setImplementation(scenarios);
}
