import type { Schema } from "electron-store";

export const UiTheme = {
  Jaquelene: "jaquelene",
  Dracula: "dracula",
} as const;

export type UiTheme = (typeof UiTheme)[keyof typeof UiTheme];

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

export const MotionPreference = {
  System: "system",
  Reduced: "reduced",
  Full: "full",
} as const;

export type MotionPreference = (typeof MotionPreference)[keyof typeof MotionPreference];

export type UserInterfacePreferenceValues = {
  theme: UiTheme;
  font: UiFont;
  scale: InterfaceScale;
  motion: MotionPreference;
};

type UserInterfacePreferencesStorage = {
  read(): UserInterfacePreferenceValues | undefined;
  write(values: UserInterfacePreferenceValues): void;
  subscribe(listener: () => void): () => void;
};

const defaultValues = {
  theme: UiTheme.Jaquelene,
  font: UiFont.Inter,
  scale: InterfaceScale.Percent100,
  motion: MotionPreference.System,
} satisfies UserInterfacePreferenceValues;

export const userInterfacePreferencesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    theme: {
      type: "string",
      enum: [UiTheme.Jaquelene, UiTheme.Dracula],
    },
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
    motion: {
      type: "string",
      enum: [MotionPreference.System, MotionPreference.Reduced, MotionPreference.Full],
    },
  },
  required: ["theme", "font", "scale", "motion"],
} satisfies Schema<{ userInterface: UserInterfacePreferenceValues }>["userInterface"];

function requireTheme(theme: UiTheme) {
  if (theme !== UiTheme.Jaquelene && theme !== UiTheme.Dracula) {
    throw new TypeError(`Unknown UI theme "${theme}".`);
  }
}

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

function requireMotion(motion: MotionPreference) {
  if (
    motion !== MotionPreference.System &&
    motion !== MotionPreference.Reduced &&
    motion !== MotionPreference.Full
  ) {
    throw new TypeError(`Unknown motion preference "${motion}".`);
  }
}

export function createUserInterfacePreferences(storage: UserInterfacePreferencesStorage) {
  function get(): UserInterfacePreferenceValues {
    return { ...(storage.read() ?? defaultValues) };
  }

  return {
    get,

    subscribe(listener: (values: UserInterfacePreferenceValues) => void) {
      return storage.subscribe(() => listener(get()));
    },

    setTheme(theme: UiTheme) {
      requireTheme(theme);
      const values = { ...get(), theme };
      storage.write(values);
      return { ...values };
    },

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

    setMotion(motion: MotionPreference) {
      requireMotion(motion);
      const values = { ...get(), motion };
      storage.write(values);
      return { ...values };
    },
  };
}

export type UserInterfacePreferences = ReturnType<typeof createUserInterfacePreferences>;
