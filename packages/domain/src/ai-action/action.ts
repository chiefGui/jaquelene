export const AI_ACTION_TEXT_MAX_UTF16_LENGTH = 40_000;

export type AiActionDescriptor = Readonly<{
  id: string;
  label: string;
  requiresText: boolean;
}>;
