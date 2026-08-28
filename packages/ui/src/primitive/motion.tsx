import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

export type MotionMode = "full" | "reduced" | "system";

export type MotionProviderProps = {
  children: ReactNode;
  mode: MotionMode;
};

const ReducedMotionContext = createContext<boolean | null>(null);
const reducedMotionMediaQuery = "(prefers-reduced-motion: reduce)";
let systemPreference: MediaQueryList | undefined;

function getSystemPreference() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  systemPreference ??= window.matchMedia(reducedMotionMediaQuery);
  return systemPreference;
}

function subscribeToSystemPreference(onChange: () => void) {
  const preference = getSystemPreference();
  preference?.addEventListener("change", onChange);
  return () => preference?.removeEventListener("change", onChange);
}

function getSystemPreferenceSnapshot() {
  return getSystemPreference()?.matches ?? true;
}

export function MotionProvider({ children, mode }: MotionProviderProps) {
  const systemReducedMotion = useSyncExternalStore(
    subscribeToSystemPreference,
    getSystemPreferenceSnapshot,
    () => true,
  );
  const reducedMotion = mode === "reduced" || (mode === "system" && systemReducedMotion);

  return (
    <ReducedMotionContext.Provider value={reducedMotion}>{children}</ReducedMotionContext.Provider>
  );
}

export function useReducedMotion() {
  const reducedMotion = useContext(ReducedMotionContext);

  if (reducedMotion === null) {
    throw new Error("useReducedMotion must be used inside MotionProvider.");
  }

  return reducedMotion;
}
