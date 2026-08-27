import { Button, Input } from "@jaquelene/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type MouseEvent, type SubmitEvent } from "react";
import {
  openRouterStatusQuery,
  useClearOpenRouter,
  useConfigureOpenRouter,
} from "@/feature/provider/openrouter/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";
import { Item } from "@/primitive/item";

export const Route = createFileRoute("/settings/providers")({
  loader: ({ context }) =>
    context.queryClient.query({ ...openRouterStatusQuery, staleTime: "static" }),
  component: ProvidersRoute,
});

function ProvidersRoute() {
  const { data: openRouterStatus } = useSuspenseQuery(openRouterStatusQuery);
  const configureOpenRouter = useConfigureOpenRouter();
  const clearOpenRouter = useClearOpenRouter();
  const [error, setError] = useState<string | null>(null);
  const pending = configureOpenRouter.isPending || clearOpenRouter.isPending;

  async function configure(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const apiKey = new FormData(form).get("apiKey");

    if (typeof apiKey !== "string" || !apiKey.trim()) {
      setError("Enter an API key.");
      return;
    }

    setError(null);

    try {
      await configureOpenRouter.mutateAsync(apiKey);
      form.reset();
    } catch (cause) {
      console.error("Could not configure OpenRouter.", cause);
      setError("Could not save the API key.");
    }
  }

  async function clear(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    setError(null);

    try {
      await clearOpenRouter.mutateAsync();
      form?.reset();
    } catch (cause) {
      console.error("Could not clear the OpenRouter configuration.", cause);
      setError("Could not clear the API key.");
    }
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root className="min-w-0 text-sm">
          <Breadcrumb.List className="flex min-w-0 items-center gap-2">
            <Breadcrumb.Item className="text-muted">Settings</Breadcrumb.Item>
            <Breadcrumb.Separator className="text-muted" />
            <Breadcrumb.Item>
              <Breadcrumb.Page className="font-medium text-foreground">Providers</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <div className="mx-auto w-full max-w-2xl p-6">
          <Item.Group>
            <Item.Root className="items-start">
              <Item.Content className="w-full">
                <div className="flex items-center justify-between gap-4">
                  <Item.Title>OpenRouter</Item.Title>
                  <span aria-live="polite" className="text-xs text-muted">
                    {openRouterStatus.configured ? "Configured" : "Not configured"}
                  </span>
                </div>

                <form className="mt-4 flex items-end gap-2" onSubmit={configure}>
                  <div className="min-w-0 flex-1">
                    <label htmlFor="openrouter-api-key" className="text-sm font-medium">
                      API key
                    </label>
                    <Input
                      id="openrouter-api-key"
                      name="apiKey"
                      type="password"
                      required
                      autoComplete="off"
                      disabled={pending}
                      spellCheck={false}
                      aria-describedby={error ? "openrouter-configuration-error" : undefined}
                      className="mt-2 w-full"
                      placeholder="OpenRouter API key"
                    />
                  </div>
                  <Button type="submit" disabled={pending}>
                    {configureOpenRouter.isPending ? "Saving…" : "Save"}
                  </Button>
                  {openRouterStatus.configured ? (
                    <Button type="button" variant="ghost" disabled={pending} onClick={clear}>
                      {clearOpenRouter.isPending ? "Clearing…" : "Clear"}
                    </Button>
                  ) : null}
                </form>

                {error ? (
                  <p
                    id="openrouter-configuration-error"
                    role="alert"
                    className="mt-2 text-sm text-danger"
                  >
                    {error}
                  </p>
                ) : null}
              </Item.Content>
            </Item.Root>
          </Item.Group>
        </div>
      </ContentPane.Viewport>
    </>
  );
}
