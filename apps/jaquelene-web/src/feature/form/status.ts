import { useCallback, useEffect, useRef, useState } from "react";

export type FormStatus = Readonly<{
  message: string;
  tone: "danger" | "neutral";
}>;

const successDurationMs = 3_000;

export function useFormStatus() {
  const [status, setStatus] = useState<FormStatus | null>(null);
  const dismissal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelDismissal = useCallback(() => {
    if (dismissal.current !== undefined) {
      clearTimeout(dismissal.current);
      dismissal.current = undefined;
    }
  }, []);

  useEffect(
    () => () => {
      cancelDismissal();
    },
    [cancelDismissal],
  );

  const clear = useCallback(() => {
    cancelDismissal();
    setStatus(null);
  }, [cancelDismissal]);

  const showError = useCallback(
    (message: string) => {
      cancelDismissal();
      setStatus({ message, tone: "danger" });
    },
    [cancelDismissal],
  );

  const showSuccess = useCallback(
    (message: string) => {
      cancelDismissal();
      setStatus({ message, tone: "neutral" });
      dismissal.current = setTimeout(() => {
        dismissal.current = undefined;
        setStatus(null);
      }, successDurationMs);
    },
    [cancelDismissal],
  );

  return { clear, showError, showSuccess, status } as const;
}
