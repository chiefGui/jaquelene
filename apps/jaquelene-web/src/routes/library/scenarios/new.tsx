import { createFileRoute } from "@tanstack/react-router";
import { scenarioLibrary } from "@/feature/prompt/text-libraries";
import { NewTextLibraryPrompt } from "@/feature/prompt/text-library-new";

export const Route = createFileRoute("/library/scenarios/new")({
  component: () => <NewTextLibraryPrompt library={scenarioLibrary} />,
});
