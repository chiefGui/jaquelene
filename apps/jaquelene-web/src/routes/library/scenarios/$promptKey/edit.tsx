import { createFileRoute } from "@tanstack/react-router";
import { scenarioLibrary } from "@/feature/prompt/text-libraries";
import { EditTextLibraryPrompt } from "@/feature/prompt/text-library-edit";
import { loadTextLibraryPrompt } from "@/feature/prompt/text-library-loader";

export const Route = createFileRoute("/library/scenarios/$promptKey/edit")({
  loader: ({ context, params }) =>
    loadTextLibraryPrompt(context.queryClient, scenarioLibrary, params.promptKey),
  remountDeps: ({ params }) => params.promptKey,
  component: EditScenarioRoute,
});

function EditScenarioRoute() {
  return <EditTextLibraryPrompt library={scenarioLibrary} promptKey={Route.useLoaderData()} />;
}
