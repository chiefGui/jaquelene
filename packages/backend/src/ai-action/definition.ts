import type { AiActionDescriptor } from "@jaquelene/domain";
import type { ModelInput } from "#backend/model/input";

export type AiActionDefinition = AiActionDescriptor &
  Readonly<{
    prepare: (text: string) => ModelInput;
    parseResult: (text: string) => string;
  }>;

export type AiActionSet = Readonly<{
  target: string;
  actions: readonly AiActionDefinition[];
}>;
