import type { RequestedModelConfiguration } from "@jaquelene/backend";
import type { RequestedModelConfiguration as IpcRequestedModelConfiguration } from "@jaquelene/ipc/main";
import { fromIpcReasoningPreset } from "./reasoning-preset";

export function fromIpcModelConfiguration(
  configuration: IpcRequestedModelConfiguration,
): RequestedModelConfiguration {
  const model = { ...configuration.model };
  if (configuration.reasoningPreset === undefined) return { model };
  return { model, reasoningPreset: fromIpcReasoningPreset(configuration.reasoningPreset) };
}
