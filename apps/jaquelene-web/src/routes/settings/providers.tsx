import { OpenRouterConnectionState } from "@jaquelene/ipc/renderer";
import { Button, Input, Item, Ping } from "@jaquelene/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type SubmitEvent } from "react";
import { getBrandName } from "@/feature/brand/catalog";
import { ProviderMark } from "@/feature/provider/mark";
import {
  openRouterConnectionQuery,
  openRouterProvider,
  useConnectOpenRouter,
  useDisconnectOpenRouter,
} from "@/feature/provider/openrouter/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/providers")({
  loader: ({ context }) =>
    context.queryClient.query({ ...openRouterConnectionQuery, staleTime: "static" }),
  component: ProvidersRoute,
});

function ConnectionIssue({ state }: { state: OpenRouterConnectionState }) {
  switch (state) {
    case OpenRouterConnectionState.Disconnected:
    case OpenRouterConnectionState.Connected:
      return null;
    case OpenRouterConnectionState.Rejected:
      return (
        <span
          aria-live="polite"
          className="mr-2 flex items-center gap-1.5 text-xs font-medium text-danger"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          <span className="text-box-trim">Connection failed</span>
        </span>
      );
    case OpenRouterConnectionState.Unavailable:
      return (
        <span aria-live="polite" className="mr-2 text-xs text-muted text-box-trim">
          Couldn’t verify
        </span>
      );
  }
}

function ProvidersRoute() {
  const {
    data: openRouterStatus,
    isFetching,
    refetch,
  } = useSuspenseQuery(openRouterConnectionQuery);
  const connectOpenRouter = useConnectOpenRouter();
  const disconnectOpenRouter = useDisconnectOpenRouter();
  const [editingConnection, setEditingConnection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = connectOpenRouter.isPending || disconnectOpenRouter.isPending;
  const connected = openRouterStatus.state === OpenRouterConnectionState.Connected;
  const hasCredential = openRouterStatus.state !== OpenRouterConnectionState.Disconnected;

  function startEditingConnection() {
    setError(null);
    setEditingConnection(true);
  }

  function stopEditingConnection() {
    setError(null);
    setEditingConnection(false);
  }

  async function connect(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const apiKey = new FormData(form).get("apiKey");

    if (typeof apiKey !== "string" || !apiKey.trim()) {
      setError("Enter an API key.");
      return;
    }

    setError(null);

    try {
      const status = await connectOpenRouter.mutateAsync(apiKey);

      switch (status.state) {
        case OpenRouterConnectionState.Connected:
          form.reset();
          setEditingConnection(false);
          return;
        case OpenRouterConnectionState.Rejected:
          setError("OpenRouter rejected this API key.");
          return;
        case OpenRouterConnectionState.Unavailable:
          setError("Couldn’t reach OpenRouter. Try again.");
          return;
        case OpenRouterConnectionState.Disconnected:
          throw new Error("OpenRouter returned an invalid connection state.");
      }
    } catch (cause) {
      console.error("Could not connect to OpenRouter.", cause);
      setError("Couldn’t connect to OpenRouter.");
    }
  }

  async function disconnect() {
    setError(null);

    try {
      await disconnectOpenRouter.mutateAsync();
      setEditingConnection(false);
    } catch (cause) {
      console.error("Could not disconnect OpenRouter.", cause);
      setError("Couldn’t disconnect OpenRouter.");
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
            <Item.Root>
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/4">
                  <ProviderMark brandId={openRouterProvider.brandId} className="size-3.5" />
                </span>
                <Item.Content>
                  <div className="flex items-center gap-2">
                    <Item.Label>{getBrandName(openRouterProvider.brandId)}</Item.Label>
                    {connected ? (
                      <>
                        <Ping className="text-success" />
                        <span className="sr-only">Connected</span>
                      </>
                    ) : null}
                  </div>
                  {connected && openRouterStatus.keyLabel ? (
                    <Item.Description className="font-mono text-xs">
                      {openRouterStatus.keyLabel}
                    </Item.Description>
                  ) : null}
                </Item.Content>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <ConnectionIssue state={openRouterStatus.state} />

                {!editingConnection &&
                openRouterStatus.state === OpenRouterConnectionState.Unavailable ? (
                  <Button
                    variant="ghost"
                    disabled={pending || isFetching}
                    onClick={() => void refetch()}
                  >
                    {isFetching ? "Retrying…" : "Retry"}
                  </Button>
                ) : null}

                {!editingConnection && hasCredential ? (
                  <>
                    <Button variant="ghost" disabled={pending} onClick={startEditingConnection}>
                      Manage
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pending}
                      className="text-muted not-disabled:hover:bg-danger/10 not-disabled:hover:text-danger"
                      onClick={disconnect}
                    >
                      {disconnectOpenRouter.isPending ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  </>
                ) : null}

                {!editingConnection && !hasCredential ? (
                  <Button disabled={pending} onClick={startEditingConnection}>
                    Connect
                  </Button>
                ) : null}
              </div>
            </Item.Root>

            {editingConnection ? (
              <Item.Root render={<form onSubmit={connect} />} className="items-start">
                <Item.Label
                  render={<label htmlFor="openrouter-api-key" />}
                  className="flex h-control items-center"
                >
                  API key
                </Item.Label>

                <div className="min-w-0 flex-1">
                  <div className="flex justify-end gap-2">
                    <Input
                      id="openrouter-api-key"
                      name="apiKey"
                      type="password"
                      required
                      autoComplete="off"
                      disabled={pending}
                      spellCheck={false}
                      aria-describedby={error ? "openrouter-connection-error" : undefined}
                      className="min-w-0 max-w-sm flex-1"
                      placeholder={
                        connected && openRouterStatus.keyLabel
                          ? openRouterStatus.keyLabel
                          : "sk-or-v1-…"
                      }
                    />
                    <Button type="submit" disabled={pending}>
                      {connectOpenRouter.isPending ? "Connecting…" : "Connect"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={stopEditingConnection}
                    >
                      Cancel
                    </Button>
                  </div>

                  {error ? (
                    <p
                      id="openrouter-connection-error"
                      role="alert"
                      className="mt-2 text-sm text-danger"
                    >
                      {error}
                    </p>
                  ) : null}
                </div>
              </Item.Root>
            ) : null}
          </Item.Group>

          {!editingConnection && error ? (
            <p role="alert" className="mt-2 px-1 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </ContentPane.Viewport>
    </>
  );
}
