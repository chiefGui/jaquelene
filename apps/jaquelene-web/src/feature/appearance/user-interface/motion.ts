import { MotionPreference } from "@jaquelene/ipc/renderer";
import type { MotionMode } from "@jaquelene/ui/motion";

type MotionPreferenceDefinition = {
  label: string;
  mode: MotionMode;
  value: MotionPreference;
};

export const motionPreferences = {
  [MotionPreference.System]: {
    label: "System",
    mode: "system",
    value: MotionPreference.System,
  },
  [MotionPreference.Reduced]: {
    label: "Reduced",
    mode: "reduced",
    value: MotionPreference.Reduced,
  },
  [MotionPreference.Full]: {
    label: "Full",
    mode: "full",
    value: MotionPreference.Full,
  },
} as const satisfies Record<MotionPreference, MotionPreferenceDefinition>;
