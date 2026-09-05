export type ResolvedInstruction = Readonly<{
  sourceKey: string;
  content: string;
}>;

export type DialogueMessage = Readonly<{
  sourceKey: string;
  role: "user" | "assistant";
  content: string;
}>;

export type ModelInput = Readonly<{
  instructions: readonly ResolvedInstruction[];
  dialogue: readonly DialogueMessage[];
}>;

function requireText(value: string, field: string) {
  if (!value.trim()) {
    throw new TypeError(`A model input requires ${field}.`);
  }
}

export function requireModelInput(input: ModelInput): ModelInput {
  const instructionSourceKeys = new Set<string>();
  const instructions = input.instructions.map(({ sourceKey, content }) => {
    requireText(sourceKey, "an instruction source key");
    requireText(content, "instruction content");

    if (instructionSourceKeys.has(sourceKey)) {
      throw new TypeError(
        `A model input cannot contain duplicate instruction source "${sourceKey}".`,
      );
    }

    instructionSourceKeys.add(sourceKey);
    return { sourceKey, content };
  });
  const sourceKeys = new Set<string>();
  const dialogue = input.dialogue.map(({ sourceKey, role, content }) => {
    requireText(sourceKey, "a dialogue source key");
    requireText(content, "dialogue content");

    if (role !== "user" && role !== "assistant") {
      throw new TypeError(`A model input contains unsupported dialogue role "${role}".`);
    }

    if (sourceKeys.has(sourceKey)) {
      throw new TypeError(`A model input cannot contain duplicate message "${sourceKey}".`);
    }

    sourceKeys.add(sourceKey);
    return { sourceKey, role, content };
  });

  return { instructions, dialogue };
}
