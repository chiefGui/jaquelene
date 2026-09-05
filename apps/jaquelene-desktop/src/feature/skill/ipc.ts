import { type SkillDefault, type SkillKind, type Skills } from "@jaquelene/backend";
import { skillKeySchema, skillKindKeySchema } from "@jaquelene/domain";
import {
  SkillDefaultSource,
  Skills as SkillsIpc,
  type SkillDefault as IpcSkillDefault,
  type SkillKind as IpcSkillKind,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";

function toIpcKind(kind: SkillKind): IpcSkillKind {
  return { ...kind };
}

function toIpcDefaultSource(source: SkillDefault["source"]) {
  switch (source) {
    case "override":
      return SkillDefaultSource.Override;
    case "fallback":
      return SkillDefaultSource.Fallback;
    case "none":
      return SkillDefaultSource.None;
  }
}

function toIpcSkillDefault(selection: SkillDefault): IpcSkillDefault {
  return {
    kind: selection.kind,
    source: toIpcDefaultSource(selection.source),
    ...(selection.skillKey !== null && { skillKey: selection.skillKey }),
  };
}

export function exposeSkills(target: WebFrameMain, skills: Skills) {
  SkillsIpc.for(target).setImplementation({
    listKinds: () => skills.listKinds().map(toIpcKind),
    list: ({ kind, cursor }) => {
      const page = skills.list({
        kind: skillKindKeySchema.parse(kind),
        ...(cursor !== undefined && { cursor }),
      });
      return {
        skills: [...page.skills],
        ...(page.nextCursor !== undefined && { nextCursor: page.nextCursor }),
      };
    },
    get: (key) => {
      return skills.get(skillKeySchema.parse(key));
    },
    create: (input) => skills.create(input),
    update: ({ key, input }) => {
      return skills.update(skillKeySchema.parse(key), input);
    },
    delete: (key) => {
      const deletion = skills.delete(skillKeySchema.parse(key));
      return deletion;
    },
    getDefault: (kind) => toIpcSkillDefault(skills.getDefault(skillKindKeySchema.parse(kind))),
    setDefault: ({ kind, skillKey }) => {
      let key;
      if (skillKey !== undefined) {
        key = skillKeySchema.parse(skillKey);
      }
      return toIpcSkillDefault(skills.setDefault(skillKindKeySchema.parse(kind), key));
    },
  });
}
