import { PlayerResponseError, type PlayerResponses } from "@jaquelene/backend";
import type { PlayerResponse } from "@jaquelene/domain";
import type { PlayerResponseResult } from "@jaquelene/ipc/player-response";
import { Cause, Exit, type Effect, type Fiber } from "effect";

export type SkillEffectFork = <A, E>(effect: Effect.Effect<A, E>) => Fiber.Fiber<A, E>;

export function createPlayerResponseExecutions(
  skills: Pick<PlayerResponses, "execute">,
  runFork: SkillEffectFork,
  reportFailure: (cause: unknown) => void,
) {
  let closed = false;
  let active: { requestId: string; fiber: Fiber.Fiber<PlayerResponse, unknown> } | undefined;

  function cancel(requestId: string) {
    if (active?.requestId !== requestId) return false;
    active.fiber.interruptUnsafe();
    return true;
  }

  return {
    execute(
      requestId: string,
      request: Parameters<PlayerResponses["execute"]>[0],
    ): Promise<PlayerResponseResult> {
      if (closed) throw new Error("Player responses are closed.");
      if (active) throw new Error("A player response is already running.");
      const execution = { requestId, fiber: runFork(skills.execute(request)) };
      active = execution;
      return new Promise((resolve) => {
        execution.fiber.addObserver((exit) => {
          active = undefined;
          if (Exit.isSuccess(exit)) {
            resolve({ status: "completed", text: exit.value.text });
          } else if (Cause.hasInterruptsOnly(exit.cause)) {
            resolve({ status: "cancelled" });
          } else {
            const cause = Cause.squash(exit.cause);
            let message = "Could not generate a response.";
            if (cause instanceof PlayerResponseError) message = cause.message;
            reportFailure(cause);
            resolve({ status: "failed", message });
          }
        });
      });
    },
    cancel,
    cancelActive() {
      if (active) cancel(active.requestId);
    },
    close() {
      closed = true;
      if (active) cancel(active.requestId);
    },
  };
}
