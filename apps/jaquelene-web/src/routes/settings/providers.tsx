import { OpenRouterConnectionState } from "@jaquelene/ipc/renderer";
import { Button, Input, Item, Ping } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { tokens } from "@jaquelene/ui/theme.stylex";
import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type SubmitEvent } from "react";
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
        <span aria-live="polite" {...stylex.props(styles.connectionRejected)}>
          <span aria-hidden="true" {...stylex.props(styles.connectionDot)} />
          <span {...stylex.props(styles.textBox)}>Connection failed</span>
        </span>
      );
    case OpenRouterConnectionState.Unavailable:
      return (
        <span aria-live="polite" {...stylex.props(styles.connectionUnavailable)}>
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
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const connectButton = useRef<HTMLButtonElement>(null);
  const pending = connectOpenRouter.isPending || disconnectOpenRouter.isPending;
  const connected = openRouterStatus.state === OpenRouterConnectionState.Connected;
  const hasCredential = openRouterStatus.state !== OpenRouterConnectionState.Disconnected;

  function startEditingConnection() {
    setConnectionError(null);
    setEditingConnection(true);
  }

  function stopEditingConnection() {
    setConnectionError(null);
    setEditingConnection(false);
  }

  function setDisconnectConfirmationOpen(open: boolean) {
    if (open) disconnectOpenRouter.reset();
    setConfirmingDisconnect(open);
  }

  async function connect(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const apiKey = new FormData(form).get("apiKey");

    if (typeof apiKey !== "string" || !apiKey.trim()) {
      setConnectionError("Enter an API key.");
      return;
    }

    setConnectionError(null);

    try {
      const status = await connectOpenRouter.mutateAsync(apiKey);

      switch (status.state) {
        case OpenRouterConnectionState.Connected:
          form.reset();
          setEditingConnection(false);
          return;
        case OpenRouterConnectionState.Rejected:
          setConnectionError("OpenRouter rejected this API key.");
          return;
        case OpenRouterConnectionState.Unavailable:
          setConnectionError("Couldn’t reach OpenRouter. Try again.");
          return;
        case OpenRouterConnectionState.Disconnected:
          throw new Error("OpenRouter returned an invalid connection state.");
      }
    } catch (cause) {
      console.error("Could not connect to OpenRouter.", cause);
      setConnectionError("Couldn’t connect to OpenRouter.");
    }
  }

  async function disconnect() {
    try {
      await disconnectOpenRouter.mutateAsync();
      setConfirmingDisconnect(false);
    } catch (cause) {
      console.error("Could not disconnect OpenRouter.", cause);
    }
  }

  return (
    <>
      <ContentPane.Header>
        <Breadcrumb.Root>
          <Breadcrumb.List>
            <Breadcrumb.Item>Settings</Breadcrumb.Item>
            <Breadcrumb.Separator />
            <Breadcrumb.Item>
              <Breadcrumb.Page>Providers</Breadcrumb.Page>
            </Breadcrumb.Item>
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </ContentPane.Header>

      <ContentPane.Viewport>
        <ContentPane.Body>
          <Item.Group>
            <Item.Root>
              <div {...stylex.props(styles.provider)}>
                <span {...stylex.props(styles.providerMarkContainer)}>
                  <ProviderMark brandId={openRouterProvider.brandId} style={styles.providerMark} />
                </span>
                <Item.Content>
                  <div {...stylex.props(styles.providerLabel)}>
                    <Item.Label>{getBrandName(openRouterProvider.brandId)}</Item.Label>
                    {connected ? (
                      <>
                        <Ping style={styles.connected} />
                        <VisuallyHidden>Connected</VisuallyHidden>
                      </>
                    ) : null}
                  </div>
                  {connected && openRouterStatus.keyLabel ? (
                    <Item.Description style={styles.mono}>
                      {openRouterStatus.keyLabel}
                    </Item.Description>
                  ) : null}
                </Item.Content>
              </div>

              <div {...stylex.props(styles.actions)}>
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
                  <Button variant="ghost" disabled={pending} onClick={startEditingConnection}>
                    Manage
                  </Button>
                ) : null}

                <ConfirmDialog
                  open={confirmingDisconnect}
                  setOpen={setDisconnectConfirmationOpen}
                  trigger={
                    !editingConnection && hasCredential ? (
                      <Button variant="ghost" disabled={pending} style={styles.disconnect}>
                        Disconnect
                      </Button>
                    ) : null
                  }
                  heading="Disconnect OpenRouter?"
                  description="Your saved API key will be removed. Reconnect to use OpenRouter models."
                  confirmLabel={disconnectOpenRouter.isPending ? "Disconnecting…" : "Disconnect"}
                  pending={disconnectOpenRouter.isPending}
                  error={
                    disconnectOpenRouter.isError ? "Couldn’t disconnect OpenRouter." : undefined
                  }
                  finalFocus={connectButton}
                  onConfirm={() => void disconnect()}
                />

                {!editingConnection && !hasCredential ? (
                  <Button ref={connectButton} disabled={pending} onClick={startEditingConnection}>
                    Connect
                  </Button>
                ) : null}
              </div>
            </Item.Root>

            {editingConnection ? (
              <Item.Root render={<form onSubmit={connect} />} style={styles.form}>
                <Item.Label
                  render={<label htmlFor="openrouter-api-key" />}
                  style={styles.formLabel}
                >
                  API key
                </Item.Label>

                <div {...stylex.props(styles.formContent)}>
                  <div {...stylex.props(styles.formActions)}>
                    <Input
                      id="openrouter-api-key"
                      name="apiKey"
                      type="password"
                      required
                      autoComplete="off"
                      disabled={pending}
                      spellCheck={false}
                      aria-describedby={connectionError ? "openrouter-connection-error" : undefined}
                      style={styles.input}
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

                  {connectionError ? (
                    <p
                      id="openrouter-connection-error"
                      role="alert"
                      {...stylex.props(styles.formError)}
                    >
                      {connectionError}
                    </p>
                  ) : null}
                </div>
              </Item.Root>
            ) : null}
          </Item.Group>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  connectionRejected: {
    alignItems: "center",
    color: tokens.danger,
    display: "flex",
    fontSize: tokens.fontSizeXSmall,
    fontWeight: 500,
    gap: "0.375rem",
    lineHeight: tokens.lineHeightXSmall,
    marginRight: "0.5rem",
  },
  connectionDot: {
    backgroundColor: "currentColor",
    borderRadius: "9999px",
    height: "0.375rem",
    width: "0.375rem",
  },
  textBox: {
    textBox: "trim-both text",
  },
  connectionUnavailable: {
    color: tokens.muted,
    fontSize: tokens.fontSizeXSmall,
    lineHeight: tokens.lineHeightXSmall,
    marginRight: "0.5rem",
    textBox: "trim-both text",
  },
  provider: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    minWidth: 0,
  },
  providerMarkContainer: {
    backgroundColor: `color-mix(in oklab, ${tokens.foreground} 4%, transparent)`,
    borderRadius: tokens.radiusLarge,
    display: "grid",
    flexShrink: 0,
    height: "2rem",
    placeItems: "center",
    width: "2rem",
  },
  providerMark: {
    height: "0.875rem",
    width: "0.875rem",
  },
  providerLabel: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
  },
  connected: {
    color: tokens.success,
  },
  mono: {
    fontFamily: tokens.fontMono,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.25rem",
  },
  disconnect: {
    backgroundColor: {
      default: "transparent",
      ":not(:disabled):hover": `color-mix(in oklab, ${tokens.danger} 10%, transparent)`,
    },
    color: {
      default: tokens.muted,
      ":not(:disabled):hover": tokens.danger,
    },
  },
  form: {
    alignItems: "flex-start",
  },
  formLabel: {
    alignItems: "center",
    display: "flex",
    height: tokens.controlHeight,
  },
  formContent: {
    flex: 1,
    minWidth: 0,
  },
  formActions: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
  },
  input: {
    flex: 1,
    maxWidth: "24rem",
    minWidth: 0,
  },
  formError: {
    color: tokens.danger,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.5rem",
  },
});
