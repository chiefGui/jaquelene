import { createFileRoute } from "@tanstack/react-router";
import { scenarioLibrary } from "@/feature/prompt/text-libraries";
import { TextLibraryList } from "@/feature/prompt/text-library-list";
import { loadTextLibrary } from "@/feature/prompt/text-library-loader";

export const Route = createFileRoute("/library/scenarios/")({
  loader: ({ context }) => loadTextLibrary(context.queryClient, scenarioLibrary),
  component: () => <TextLibraryList library={scenarioLibrary} />,
});
