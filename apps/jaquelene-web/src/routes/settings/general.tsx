import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/general")({
  component: () => (
    <div className="grid h-full place-items-center">
      <h1 className="text-sm font-medium">General settings</h1>
    </div>
  ),
});
