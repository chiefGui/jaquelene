import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <main className="grid min-h-screen place-items-center bg-white text-black">
      <h1>Hello world</h1>
    </main>
  ),
});
