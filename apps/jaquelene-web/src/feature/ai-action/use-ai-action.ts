import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { aiActionModelQuery, aiActionsQuery, cancelAiAction, runAiAction } from "./query";

type ActionState =
  | { status: "idle" }
  | { status: "running"; cancellationError?: string }
  | { status: "cancelling" }
  | { status: "failed"; message: string };

export function useAiAction({
  target,
  value,
  onValueChange,
  disabled,
}: {
  target: string | undefined;
  value: string;
  onValueChange: (text: string) => void;
  disabled: boolean;
}) {
  const definitions = useQuery({ ...aiActionsQuery(target ?? ""), enabled: target !== undefined });
  const model = useQuery({ ...aiActionModelQuery, enabled: target !== undefined });
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [change, setChange] = useState<{ before: string; after: string } | null>(null);
  const pending = useRef<{ id: string; cancelled: boolean } | null>(null);

  useEffect(() => {
    setState({ status: "idle" });
    setChange(null);
    return () => {
      const operation = pending.current;
      pending.current = null;
      if (operation) {
        operation.cancelled = true;
        void cancelAiAction(operation.id).catch((cause: unknown) =>
          reportError("ai-action.cancel", cause),
        );
      }
    };
  }, [target]);

  const run = useCallback(
    async (actionId: string) => {
      if (disabled || pending.current || !target) {
        return;
      }
      const operation = { id: crypto.randomUUID(), cancelled: false };
      pending.current = operation;
      setState({ status: "running" });
      try {
        const result = await runAiAction({
          executionId: operation.id,
          target,
          actionId,
          text: value,
        });
        if (pending.current !== operation) {
          return;
        }
        if (operation.cancelled || result.status === "cancelled") {
          setState({ status: "idle" });
          return;
        }
        if (result.status === "failed") {
          setState({ status: "failed", message: result.message });
          return;
        }
        setChange({ before: value, after: result.text });
        onValueChange(result.text);
        setState({ status: "idle" });
      } catch (cause) {
        reportError("ai-action.run", cause);
        if (pending.current === operation) {
          setState({ status: "failed", message: "Couldn't run this AI action. Try again." });
        }
      } finally {
        if (pending.current === operation) {
          pending.current = null;
        }
      }
    },
    [disabled, onValueChange, target, value],
  );

  async function cancel() {
    const operation = pending.current;
    if (!operation || operation.cancelled) {
      return;
    }
    operation.cancelled = true;
    setState({ status: "cancelling" });
    try {
      await cancelAiAction(operation.id);
    } catch (cause) {
      reportError("ai-action.cancel", cause);
      if (pending.current === operation) {
        operation.cancelled = false;
        setState({ status: "running", cancellationError: "Couldn't cancel. Try again." });
      }
    }
  }

  const busy = state.status === "running" || state.status === "cancelling";
  let undoLabel: string | undefined;
  let undoValue: string | undefined;
  if (change && change.before !== change.after) {
    if (value === change.after) {
      undoLabel = "Undo AI change";
      undoValue = change.before;
    } else if (value === change.before) {
      undoLabel = "Redo AI change";
      undoValue = change.after;
    }
  }
  function undo() {
    if (!busy && !disabled && undoValue !== undefined) {
      onValueChange(undoValue);
      setState({ status: "idle" });
    }
  }
  return { busy, cancel, definitions, disabled, model, run, state, target, undo, undoLabel, value };
}

export type AiActionControl = ReturnType<typeof useAiAction>;
