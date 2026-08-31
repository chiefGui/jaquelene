import type { MessageId } from "#backend/id";

export type ResolvedInstruction = Readonly<{
  sourceKey: string;
  content: string;
}>;

export type DialogueMessage = Readonly<{
  messageId: MessageId;
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
  const messageIds = new Set<MessageId>();
  const dialogue = input.dialogue.map(({ messageId, role, content }) => {
    requireText(messageId, "a dialogue message identity");
    requireText(content, "dialogue content");

    if (messageIds.has(messageId)) {
      throw new TypeError(`A model input cannot contain duplicate message "${messageId}".`);
    }

    messageIds.add(messageId);
    return { messageId, role, content };
  });

  return { instructions, dialogue };
}
