import { parsePromptKey, parseUpdatePromptInput, type PromptKindKey } from "@jaquelene/domain";
import type { FactoryPromptDefinition, PromptKind, PromptKindRegistration } from "../types";

export const narratorPromptKind = Object.freeze({
  key: "narrator" as PromptKindKey,
  name: "Narrator",
  description: "Controls how the narrator portrays the world and continues the story.",
}) satisfies PromptKind;

const jaqueleneContent = parseUpdatePromptInput({
  title: "Jaquelene",
  body: "You are the narrator of an interactive roleplay. Use the provided context to portray the world and its characters, maintain continuity, and continue the story through narration and dialogue.",
});

export const jaqueleneNarratorPrompt = Object.freeze({
  key: parsePromptKey("factory.narrator.jaquelene"),
  kind: narratorPromptKind.key,
  origin: "factory" as const,
  ...jaqueleneContent,
  createdAt: 0,
}) satisfies FactoryPromptDefinition;

export const narratorPromptRegistration = Object.freeze({
  definition: narratorPromptKind,
  factoryPrompts: Object.freeze([jaqueleneNarratorPrompt]),
  fallbackPromptKey: jaqueleneNarratorPrompt.key,
}) satisfies PromptKindRegistration;
