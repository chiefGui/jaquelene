import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/library/opening-scenes")({ component: Outlet });
