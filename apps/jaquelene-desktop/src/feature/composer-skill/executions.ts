import { ComposerSkillError, type ComposerSkills } from "@jaquelene/backend";
import type { ComposerSkillResult } from "@jaquelene/domain";
import { Cause, Exit, type Effect, type Fiber } from "effect";

export type SkillEffectFork = <A, E>(effect: Effect.Effect<A, E>) => Fiber.Fiber<A, E>;

export function createComposerSkillExecutions(
  skills: Pick<ComposerSkills, "execute">,
  runFork: SkillEffectFork,
  reportFailure: (cause: unknown) => void,
) {
  let closed = false;
  let active: { requestId: string; fiber: Fiber.Fiber<{ text: string }, unknown> } | undefined;

  function cancel(requestId: string) {
    if (active?.requestId !== requestId) return false;
    active.fiber.interruptUnsafe();
    return true;
  }

  return {
    execute(
      requestId: string,
      request: Parameters<ComposerSkills["execute"]>[0],
    ): Promise<ComposerSkillResult> {
      if (closed) throw new Error("Composer skills are closed.");
      if (active) throw new Error("A composer skill is already running.");
      const execution = { requestId, fiber: runFork(skills.execute(request)) };
      active = execution;
      return new Promise((resolve) => {
        execution.fiber.addObserver((exit) => {
          if (active === execution) active = undefined;
          if (Exit.isSuccess(exit)) {
            resolve({ status: "completed", text: exit.value.text });
          } else if (Cause.hasInterruptsOnly(exit.cause)) {
            resolve({ status: "cancelled" });
          } else {
            const cause = Cause.squash(exit.cause);
            let message = "Could not generate a response.";
            if (cause instanceof ComposerSkillError) message = cause.message;
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
