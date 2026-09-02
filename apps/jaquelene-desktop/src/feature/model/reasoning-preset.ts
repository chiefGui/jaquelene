import type { ReasoningPreset, ReasoningPresetSource } from "@jaquelene/backend";
import {
  ReasoningPreset as IpcReasoningPreset,
  ReasoningPresetSource as IpcReasoningPresetSource,
} from "@jaquelene/ipc/main";

export function toIpcReasoningPreset(preset: ReasoningPreset): IpcReasoningPreset {
  switch (preset) {
    case "automatic":
      return IpcReasoningPreset.Automatic;
    case "on":
      return IpcReasoningPreset.On;
    case "off":
      return IpcReasoningPreset.Off;
    case "minimal":
      return IpcReasoningPreset.Minimal;
    case "low":
      return IpcReasoningPreset.Low;
    case "medium":
      return IpcReasoningPreset.Medium;
    case "high":
      return IpcReasoningPreset.High;
    case "xhigh":
      return IpcReasoningPreset.XHigh;
    case "max":
      return IpcReasoningPreset.Max;
  }
}

export function fromIpcReasoningPreset(preset: IpcReasoningPreset): ReasoningPreset {
  switch (preset) {
    case IpcReasoningPreset.Automatic:
      return "automatic";
    case IpcReasoningPreset.On:
      return "on";
    case IpcReasoningPreset.Off:
      return "off";
    case IpcReasoningPreset.Minimal:
      return "minimal";
    case IpcReasoningPreset.Low:
      return "low";
    case IpcReasoningPreset.Medium:
      return "medium";
    case IpcReasoningPreset.High:
      return "high";
    case IpcReasoningPreset.XHigh:
      return "xhigh";
    case IpcReasoningPreset.Max:
      return "max";
  }
}

export function toIpcReasoningPresetSource(
  source: ReasoningPresetSource,
): IpcReasoningPresetSource {
  switch (source) {
    case "model-default":
      return IpcReasoningPresetSource.ModelDefault;
    case "selection":
      return IpcReasoningPresetSource.Selection;
  }
}
