import { Scenarios, type Scenario } from "@jaquelene/ipc/renderer";
import { requireIpcMethod } from "@/ipc";

export type { Scenario };

export const scenarioIpc = {
  create: requireIpcMethod(Scenarios?.create),
  list: requireIpcMethod(Scenarios?.list),
  get: requireIpcMethod(Scenarios?.get),
  rename: requireIpcMethod(Scenarios?.rename),
};
