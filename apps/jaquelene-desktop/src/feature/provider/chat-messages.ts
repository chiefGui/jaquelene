import type { ModelInput } from "@jaquelene/backend";

export type ChatMessage = Readonly<{
  role: "system" | "user" | "assistant";
  content: string;
}>;

export function toChatMessages({
  instructions,
  dialogue,
  requestMessages = [],
}: ModelInput): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const systemPrompt = instructions.map(({ content }) => content).join("\n\n");
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const { role, content } of dialogue) {
    messages.push({ role, content });
  }
  for (const { role, content } of requestMessages) {
    messages.push({ role, content });
  }
  return messages;
}
