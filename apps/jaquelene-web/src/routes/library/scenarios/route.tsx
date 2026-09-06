import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/library/scenarios")({ component: Outlet });
