import type { Schema } from "electron-store";

export const UiFont = {
  System: "system",
  Inter: "inter",
  Geist: "geist",
} as const;

export type UiFont = (typeof UiFont)[keyof typeof UiFont];

export const InterfaceScale = {
  Percent90: 90,
  Percent100: 100,
  Percent110: 110,
  Percent125: 125,
} as const;

export type InterfaceScale = (typeof InterfaceScale)[keyof typeof InterfaceScale];

export type UserInterfacePreferenceValues = {
  font: UiFont;
  scale: InterfaceScale;
};

type UserInterfacePreferencesStorage = {
  read(): UserInterfacePreferenceValues | undefined;
  write(values: UserInterfacePreferenceValues): void;
};

const defaultValues = {
  font: UiFont.Inter,
  scale: InterfaceScale.Percent100,
} satisfies UserInterfacePreferenceValues;

export const userInterfacePreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    font: {
      type: "string",
      enum: [UiFont.System, UiFont.Inter, UiFont.Geist],
    },
    scale: {
      type: "number",
      enum: [
        InterfaceScale.Percent90,
        InterfaceScale.Percent100,
        InterfaceScale.Percent110,
        InterfaceScale.Percent125,
      ],
    },
  },
  required: ["font", "scale"],
} satisfies Schema<{ userInterface: UserInterfacePreferenceValues }>["userInterface"];

function requireFont(font: UiFont) {
  if (font !== UiFont.System && font !== UiFont.Inter && font !== UiFont.Geist) {
    throw new TypeError(`Unknown UI font "${font}".`);
  }
}

function requireScale(scale: InterfaceScale) {
  if (
    scale !== InterfaceScale.Percent90 &&
    scale !== InterfaceScale.Percent100 &&
    scale !== InterfaceScale.Percent110 &&
    scale !== InterfaceScale.Percent125
  ) {
    throw new TypeError(`Unsupported interface scale "${scale}".`);
  }
}

export function getInterfaceScaleFactor(scale: InterfaceScale) {
  return scale / 100;
}

export function createUserInterfacePreferences(storage: UserInterfacePreferencesStorage) {
  function get(): UserInterfacePreferenceValues {
    return { ...(storage.read() ?? defaultValues) };
  }

  return {
    get,

    setFont(font: UiFont) {
      requireFont(font);
      const values = { ...get(), font };
      storage.write(values);
      return { ...values };
    },

    setScale(scale: InterfaceScale) {
      requireScale(scale);
      const values = { ...get(), scale };
      storage.write(values);
      return { ...values };
    },
  };
}

export type UserInterfacePreferences = ReturnType<typeof createUserInterfacePreferences>;
