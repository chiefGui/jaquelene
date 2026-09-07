import { createFileRoute } from "@tanstack/react-router";
import { openingSceneLibrary } from "@/feature/prompt/text-libraries";
import { NewTextLibraryPrompt } from "@/feature/prompt/text-library-new";

export const Route = createFileRoute("/library/opening-scenes/new")({
  component: () => <NewTextLibraryPrompt library={openingSceneLibrary} />,
});
