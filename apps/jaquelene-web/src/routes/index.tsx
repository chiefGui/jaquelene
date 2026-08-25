import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="grid h-full place-items-center">
      <h1 className="text-sm font-medium">Hello world</h1>
    </div>
  ),
});
