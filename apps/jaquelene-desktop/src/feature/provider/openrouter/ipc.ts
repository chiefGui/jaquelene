import { OpenRouterConfiguration as OpenRouterConfigurationIpc } from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { OpenRouterConfiguration } from "./configuration";

export function exposeOpenRouterConfiguration(
  target: WebFrameMain,
  configuration: OpenRouterConfiguration,
) {
  OpenRouterConfigurationIpc.for(target).setImplementation(configuration);
}
