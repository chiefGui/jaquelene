import { createFileRoute } from "@tanstack/react-router";
import { openingSceneLibrary } from "@/feature/prompt/text-libraries";
import { TextLibraryList } from "@/feature/prompt/text-library-list";
import { loadTextLibrary } from "@/feature/prompt/text-library-loader";

export const Route = createFileRoute("/library/opening-scenes/")({
  loader: ({ context }) => loadTextLibrary(context.queryClient, openingSceneLibrary),
  component: () => <TextLibraryList library={openingSceneLibrary} />,
});
