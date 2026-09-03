import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/library/narrator")({
  component: Outlet,
});
