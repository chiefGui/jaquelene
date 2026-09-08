import type { SkillDescriptor } from "@jaquelene/domain";
import type {
  ModelConfigurationSelection,
  RequestedModelConfiguration,
} from "@jaquelene/ipc/renderer";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useState } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ipcMutationOptions } from "@/ipc";
import { createComposerSkillExecution } from "./execution";
import { composerSkillTransport } from "./query";
import { readThreadDraft } from "@/feature/thread/draft";
import { toRequestedModelConfiguration } from "@/feature/model/configuration";

export function useComposerSkill({
  threadId,
  configuration,
  configurationPending,
  blocked,
  focusComposer,
}: {
  threadId: string;
  configuration: ModelConfigurationSelection | null;
  configurationPending: boolean;
  blocked: boolean;
  focusComposer: () => void;
}) {
  const queryClient = useQueryClient();
  const [replacement, setReplacement] = useState<SkillDescriptor | null>(null);
  const execution = useMemo(
    () => createComposerSkillExecution(queryClient, threadId, composerSkillTransport),
    [queryClient, threadId],
  );
  const generation = useMutation({
    ...ipcMutationOptions,
    mutationKey: ["composer-skills", threadId, "execute"],
    mutationFn: ({
      skill,
      configuration,
    }: {
      skill: SkillDescriptor;
      configuration: RequestedModelConfiguration;
    }) => execution.execute(skill.id, configuration),
    onError: (cause) => reportError("composer.skill.execute", cause),
  });
  const cancellation = useMutation({
    ...ipcMutationOptions,
    mutationFn: () => execution.cancel(),
    onError: (cause) => reportError("composer.skill.cancel", cause),
  });
  const unavailable = blocked || configurationPending || !configuration || generation.isPending;

  function generate(skill: SkillDescriptor) {
    setReplacement(null);
    if (unavailable || !configuration) return;
    cancellation.reset();
    generation.mutate(
      { skill, configuration: toRequestedModelConfiguration(configuration) },
      {
        onSuccess: (result) => {
          if (result.status === "completed") focusComposer();
        },
      },
    );
  }

  function select(skill: SkillDescriptor) {
    if (unavailable) return;
    if (readThreadDraft(queryClient, threadId).content.length > 0) {
      setReplacement(skill);
      return;
    }
    generate(skill);
  }

  useLayoutEffect(() => {
    if (unavailable) setReplacement(null);
  }, [unavailable]);

  useLayoutEffect(() => {
    if (blocked) {
      void execution.cancel().catch((cause) => reportError("composer.skill.cancel", cause));
    }
  }, [blocked, execution]);

  useLayoutEffect(() => {
    execution.open();
    return () => {
      void execution.close().catch((cause) => reportError("composer.skill.cancel", cause));
    };
  }, [execution]);

  return {
    generation,
    cancellation,
    unavailable,
    confirmingReplacement: replacement !== null,
    select,
    confirmReplacement() {
      if (replacement) generate(replacement);
    },
    dismissReplacement() {
      setReplacement(null);
    },
    retry() {
      if (generation.variables) select(generation.variables.skill);
    },
  };
}
