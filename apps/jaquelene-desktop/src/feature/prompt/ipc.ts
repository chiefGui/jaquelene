import {
  ids,
  type CampaignPromptSelection,
  type Prompt,
  type PromptDefault,
  type PromptKind,
  type Prompts,
} from "@jaquelene/backend";
import { promptKeySchema, promptKindKeySchema } from "@jaquelene/domain";
import {
  CampaignPromptSource,
  PromptDefaultSource,
  PromptOrigin,
  Prompts as PromptsIpc,
  type CampaignPromptSelection as IpcCampaignPromptSelection,
  type Prompt as IpcPrompt,
  type PromptDefault as IpcPromptDefault,
  type PromptKind as IpcPromptKind,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

function toIpcOrigin(origin: Prompt["origin"]) {
  return origin === "factory" ? PromptOrigin.Factory : PromptOrigin.Custom;
}

function toIpcPrompt(prompt: Prompt): IpcPrompt {
  return { ...prompt, origin: toIpcOrigin(prompt.origin) };
}

function toIpcKind(kind: PromptKind): IpcPromptKind {
  return { ...kind };
}

function toIpcDefaultSource(source: PromptDefault["source"]) {
  switch (source) {
    case "override":
      return PromptDefaultSource.Override;
    case "fallback":
      return PromptDefaultSource.Fallback;
    case "none":
      return PromptDefaultSource.None;
  }
}

function toIpcPromptDefault(selection: PromptDefault): IpcPromptDefault {
  return {
    kind: selection.kind,
    source: toIpcDefaultSource(selection.source),
    ...(selection.promptKey ? { promptKey: selection.promptKey } : {}),
  };
}

function toIpcCampaignSource(source: CampaignPromptSelection["source"]) {
  switch (source) {
    case "campaign":
      return CampaignPromptSource.Campaign;
    case "default":
      return CampaignPromptSource.Default;
    case "fallback":
      return CampaignPromptSource.Fallback;
    case "none":
      return CampaignPromptSource.None;
  }
}

function toIpcCampaignSelection(selection: CampaignPromptSelection): IpcCampaignPromptSelection {
  return {
    campaignId: selection.campaignId,
    kind: selection.kind,
    source: toIpcCampaignSource(selection.source),
    ...(selection.selectedPromptKey ? { selectedPromptKey: selection.selectedPromptKey } : {}),
    ...(selection.effectivePromptKey ? { effectivePromptKey: selection.effectivePromptKey } : {}),
  };
}

export function exposePrompts(target: WebFrameMain, prompts: Prompts) {
  PromptsIpc.for(target).setImplementation({
    listKinds: () => prompts.listKinds().map(toIpcKind),
    list: ({ kind, cursor }) => {
      const page = prompts.list({
        kind: promptKindKeySchema.parse(kind),
        ...(cursor ? { cursor } : {}),
      });
      return {
        prompts: page.prompts.map(toIpcPrompt),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
    get: (key) => {
      const prompt = prompts.get(promptKeySchema.parse(key));
      return prompt ? toIpcPrompt(prompt) : null;
    },
    create: (input) => toIpcPrompt(prompts.create(input)),
    update: ({ key, input }) => {
      const prompt = prompts.update(promptKeySchema.parse(key), input);
      return prompt ? toIpcPrompt(prompt) : null;
    },
    delete: (key) => {
      const deletion = prompts.delete(promptKeySchema.parse(key));
      return deletion ? { kind: deletion.kind } : null;
    },
    getDefault: (kind) => toIpcPromptDefault(prompts.getDefault(promptKindKeySchema.parse(kind))),
    setDefault: ({ kind, promptKey }) =>
      toIpcPromptDefault(
        prompts.setDefault(promptKindKeySchema.parse(kind), promptKeySchema.parse(promptKey)),
      ),
    getCampaignSelection: ({ campaignId, kind }) => {
      const selection = prompts.getCampaignSelection(
        ids.campaign.parse(campaignId),
        promptKindKeySchema.parse(kind),
      );
      return selection ? toIpcCampaignSelection(selection) : null;
    },
    setCampaignSelection: ({ campaignId, kind, promptKey }) => {
      const selection = prompts.setCampaignSelection({
        campaignId: ids.campaign.parse(campaignId),
        kind: promptKindKeySchema.parse(kind),
        ...(promptKey ? { promptKey: promptKeySchema.parse(promptKey) } : {}),
      });
      return selection ? toIpcCampaignSelection(selection) : null;
    },
  });
}
