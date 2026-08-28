import { AnimatePresence, domAnimation, LazyMotion, MotionConfig } from "motion/react";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";

export type MotionMode = "full" | "reduced" | "system";

export type MotionProviderProps = {
  children: ReactNode;
  mode: MotionMode;
};

export const overlayTransition = {
  duration: 0.12,
  ease: [0.16, 1, 0.3, 1],
} as const;

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

export function MotionPresence({
  children,
  present,
}: {
  children: ReactElement;
  present: boolean;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
        <AnimatePresence initial={false}>{present ? children : null}</AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}
