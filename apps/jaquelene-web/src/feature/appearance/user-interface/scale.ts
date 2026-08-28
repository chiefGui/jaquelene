import { InterfaceScale } from "@jaquelene/ipc/renderer";

type InterfaceScaleDefinition = {
  label: string;
  value: InterfaceScale;
};

export const interfaceScales = {
  [InterfaceScale.Percent90]: {
    label: "90%",
    value: InterfaceScale.Percent90,
  },
  [InterfaceScale.Percent100]: {
    label: "100%",
    value: InterfaceScale.Percent100,
  },
  [InterfaceScale.Percent110]: {
    label: "110%",
    value: InterfaceScale.Percent110,
  },
  [InterfaceScale.Percent125]: {
    label: "125%",
    value: InterfaceScale.Percent125,
  },
} as const satisfies Record<InterfaceScale, InterfaceScaleDefinition>;
