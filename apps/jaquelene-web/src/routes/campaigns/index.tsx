import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/campaigns/")({
  beforeLoad: () => {
    throw redirect({ to: "/campaigns/new", replace: true });
  },
});
