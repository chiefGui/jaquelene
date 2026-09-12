import { ids, type PlayerResponses } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import { PlayerResponses as PlayerResponsesIpc } from "@jaquelene/ipc/main";
import type { WebContents } from "electron";
import { fromIpcModelConfiguration } from "@/feature/model/configuration";
import { createPlayerResponseExecutions, type SkillEffectFork } from "./executions";

export function exposePlayerResponses(
  target: WebContents,
  skills: PlayerResponses,
  runFork: SkillEffectFork,
  diagnostics: ErrorReporter,
) {
  const executions = createPlayerResponseExecutions(skills, runFork, (error) =>
    diagnostics.report({
      severity: ErrorSeverity.Error,
      operation: "player-response.execute",
      error,
    }),
  );
  PlayerResponsesIpc.for(target.mainFrame).setImplementation({
    list: skills.list,
    execute: (request) =>
      executions.execute(request.requestId, {
        skillId: request.skillId,
        threadId: ids.thread.parse(request.threadId),
        configuration: fromIpcModelConfiguration(request.configuration),
      }),
    cancel: executions.cancel,
  });
  target.on("did-start-loading", executions.cancelActive);
  target.on("render-process-gone", executions.cancelActive);
  return () => {
    executions.close();
    target.off("did-start-loading", executions.cancelActive);
    target.off("render-process-gone", executions.cancelActive);
  };
}
