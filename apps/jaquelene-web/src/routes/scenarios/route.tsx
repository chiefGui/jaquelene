import { Outlet, createFileRoute } from "@tanstack/react-router";
import { scenariosQuery } from "@/feature/scenario/query";
import { ScenariosSidebar } from "@/feature/scenario/sidebar";

export const Route = createFileRoute("/scenarios")({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...scenariosQuery, staleTime: "static" });
  },
  staticData: {
    primarySidebar: ScenariosSidebar,
  },
  component: Outlet,
});
