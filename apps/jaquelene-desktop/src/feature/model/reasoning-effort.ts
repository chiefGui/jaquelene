import type { ReasoningEffort } from "@jaquelene/backend";
import { ReasoningEffort as IpcReasoningEffort } from "@jaquelene/ipc/main";

export function toIpcReasoningEffort(effort: ReasoningEffort): IpcReasoningEffort {
  switch (effort) {
    case "max":
      return IpcReasoningEffort.Max;
    case "xhigh":
      return IpcReasoningEffort.XHigh;
    case "high":
      return IpcReasoningEffort.High;
    case "medium":
      return IpcReasoningEffort.Medium;
    case "low":
      return IpcReasoningEffort.Low;
    case "minimal":
      return IpcReasoningEffort.Minimal;
    case "none":
      return IpcReasoningEffort.None;
  }
}

export function fromIpcReasoningEffort(effort: IpcReasoningEffort): ReasoningEffort {
  switch (effort) {
    case IpcReasoningEffort.Max:
      return "max";
    case IpcReasoningEffort.XHigh:
      return "xhigh";
    case IpcReasoningEffort.High:
      return "high";
    case IpcReasoningEffort.Medium:
      return "medium";
    case IpcReasoningEffort.Low:
      return "low";
    case IpcReasoningEffort.Minimal:
      return "minimal";
    case IpcReasoningEffort.None:
      return "none";
  }
}
