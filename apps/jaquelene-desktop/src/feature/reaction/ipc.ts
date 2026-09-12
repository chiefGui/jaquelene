import { ids, type Reactions } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import { Reactions as ReactionsIpc } from "@jaquelene/ipc/main";
import type { WebContents } from "electron";
import { fromIpcModelConfiguration } from "@/feature/model/configuration";
import { createReactionExecutions, type SkillEffectFork } from "./executions";

export function exposeReactions(
  target: WebContents,
  skills: Reactions,
  runFork: SkillEffectFork,
  diagnostics: ErrorReporter,
) {
  const executions = createReactionExecutions(skills, runFork, (error) =>
    diagnostics.report({
      severity: ErrorSeverity.Error,
      operation: "reaction.execute",
      error,
    }),
  );
  ReactionsIpc.for(target.mainFrame).setImplementation({
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
