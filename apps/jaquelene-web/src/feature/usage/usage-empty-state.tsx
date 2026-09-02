import { EmptyState } from "@/primitive/empty-state";

export function UsageEmptyState() {
  return (
    <EmptyState.Root>
      <EmptyState.Title>No usage yet</EmptyState.Title>
      <EmptyState.Description>
        As you interact with AI, token and cost activity will appear here.
      </EmptyState.Description>
    </EmptyState.Root>
  );
}
