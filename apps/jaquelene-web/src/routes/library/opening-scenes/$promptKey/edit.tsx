import { createFileRoute } from "@tanstack/react-router";
import { openingSceneLibrary } from "@/feature/prompt/text-libraries";
import { EditTextLibraryPrompt } from "@/feature/prompt/text-library-edit";
import { loadTextLibraryPrompt } from "@/feature/prompt/text-library-loader";

export const Route = createFileRoute("/library/opening-scenes/$promptKey/edit")({
  loader: ({ context, params }) =>
    loadTextLibraryPrompt(context.queryClient, openingSceneLibrary, params.promptKey),
  remountDeps: ({ params }) => params.promptKey,
  component: EditOpeningSceneRoute,
});

function EditOpeningSceneRoute() {
  return <EditTextLibraryPrompt library={openingSceneLibrary} promptKey={Route.useLoaderData()} />;
}
