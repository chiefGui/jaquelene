import { ids, type ComposerSkills } from "@jaquelene/backend";
import { ErrorSeverity, type ErrorReporter } from "@jaquelene/diagnostics";
import { ComposerSkills as ComposerSkillsIpc } from "@jaquelene/ipc/main";
import type { WebContents } from "electron";
import { fromIpcModelConfiguration } from "@/feature/model/configuration";
import { createComposerSkillExecutions, type SkillEffectFork } from "./executions";

export function exposeComposerSkills(
  target: WebContents,
  skills: ComposerSkills,
  runFork: SkillEffectFork,
  diagnostics: ErrorReporter,
) {
  const executions = createComposerSkillExecutions(skills, runFork, (error) =>
    diagnostics.report({
      severity: ErrorSeverity.Error,
      operation: "composer.skill.execute",
      error,
    }),
  );
  ComposerSkillsIpc.for(target.mainFrame).setImplementation({
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
