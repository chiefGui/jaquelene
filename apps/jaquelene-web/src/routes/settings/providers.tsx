import {
  ProviderConfigurationKind,
  ProviderConfigurationState,
  ProviderConfigureState,
  type Provider,
} from "@jaquelene/ipc/renderer";
import { Button, IconFrame, Input, Item, Ping } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { tokens } from "@jaquelene/ui/theme.stylex";
import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useRef, useState, type SubmitEvent } from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ProviderMark } from "@/feature/provider/mark";
import {
  providersQuery,
  useClearProviderConfiguration,
  useConfigureProviderApiKey,
} from "@/feature/provider/query";
import { ContentPane } from "@/layout/content-pane";
import { Breadcrumb } from "@/primitive/breadcrumb";

export const Route = createFileRoute("/settings/providers")({
  loader: ({ context }) => context.queryClient.query(providersQuery),
  component: ProvidersRoute,
});

function ProviderSettings({ provider }: { provider: Provider }) {
  const configureProvider = useConfigureProviderApiKey(provider.id);
  const clearProvider = useClearProviderConfiguration(provider.id);
  const [editingConnection, setEditingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const connectButton = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const errorId = useId();
  const usesApiKey = provider.configuration.kind === ProviderConfigurationKind.ApiKey;
  const configured = provider.configuration.state === ProviderConfigurationState.Configured;
  const keyLabel = configured ? provider.configuration.keyLabel : undefined;
  const pending = configureProvider.isPending || clearProvider.isPending;

  function startEditingConnection() {
    setConnectionError(null);
    setEditingConnection(true);
  }

  function stopEditingConnection() {
    setConnectionError(null);
    setEditingConnection(false);
  }

  function setDisconnectConfirmationOpen(open: boolean) {
    if (open) clearProvider.reset();
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
      const result = await configureProvider.mutateAsync(apiKey);

      switch (result.state) {
        case ProviderConfigureState.Configured:
          form.reset();
          setEditingConnection(false);
          return;
        case ProviderConfigureState.Rejected:
          setConnectionError(`${provider.name} rejected this API key.`);
          return;
        case ProviderConfigureState.Unavailable:
          setConnectionError(`Couldn’t reach ${provider.name}. Try again.`);
          return;
      }
    } catch (cause) {
      reportError(`provider.${provider.id}.configure`, cause);
      setConnectionError(`Couldn’t connect to ${provider.name}.`);
    }
  }

  async function disconnect() {
    try {
      await clearProvider.mutateAsync();
      setConfirmingDisconnect(false);
    } catch (cause) {
      reportError(`provider.${provider.id}.clear`, cause);
    }
  }

  return (
    <>
      <Item.Root>
        <div {...stylex.props(styles.provider)}>
          <IconFrame style={styles.providerMarkContainer}>
            <ProviderMark brandId={provider.brandId} style={styles.providerMark} />
          </IconFrame>
          <Item.Content>
            <div {...stylex.props(styles.providerLabel)}>
              <Item.Label>{provider.name}</Item.Label>
              {configured ? (
                <>
                  <Ping style={styles.connected} />
                  <VisuallyHidden>Connected</VisuallyHidden>
                </>
              ) : null}
            </div>
            {keyLabel ? <Item.Description style={styles.mono}>{keyLabel}</Item.Description> : null}
          </Item.Content>
        </div>

        {usesApiKey ? (
          <div {...stylex.props(styles.actions)}>
            {!editingConnection && configured ? (
              <Button variant="ghost" disabled={pending} onClick={startEditingConnection}>
                Manage
              </Button>
            ) : null}

            <ConfirmDialog
              open={confirmingDisconnect}
              setOpen={setDisconnectConfirmationOpen}
              trigger={
                !editingConnection && configured ? (
                  <Button variant="ghost" tone="danger" disabled={pending}>
                    Disconnect
                  </Button>
                ) : null
              }
              heading={`Disconnect ${provider.name}?`}
              description="Removes your saved API key from this device."
              confirmLabel="Disconnect"
              pending={clearProvider.isPending}
              error={clearProvider.isError ? `Couldn’t disconnect ${provider.name}.` : undefined}
              finalFocus={connectButton}
              onConfirm={() => void disconnect()}
            />

            {!editingConnection && !configured ? (
              <Button ref={connectButton} disabled={pending} onClick={startEditingConnection}>
                Connect
              </Button>
            ) : null}
          </div>
        ) : null}
      </Item.Root>

      {usesApiKey && editingConnection ? (
        <Item.Root render={<form onSubmit={connect} />} style={styles.form}>
          <Item.Label render={<label htmlFor={inputId} />} style={styles.formLabel}>
            API key
          </Item.Label>

          <div {...stylex.props(styles.formContent)}>
            <div {...stylex.props(styles.formActions)}>
              <Input
                id={inputId}
                name="apiKey"
                type="password"
                required
                autoComplete="off"
                disabled={pending}
                spellCheck={false}
                aria-describedby={connectionError ? errorId : undefined}
                style={styles.input}
                placeholder={keyLabel ?? "Paste API key"}
              />
              <Button type="submit" disabled={pending}>
                {configureProvider.isPending ? "Connecting…" : "Connect"}
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
              <p id={errorId} role="alert" {...stylex.props(styles.formError)}>
                {connectionError}
              </p>
            ) : null}
          </div>
        </Item.Root>
      ) : null}
    </>
  );
}

function ProvidersRoute() {
  const { data: providers } = useSuspenseQuery(providersQuery);

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
            {providers.map((provider) => (
              <ProviderSettings key={provider.id} provider={provider} />
            ))}
          </Item.Group>
        </ContentPane.Body>
      </ContentPane.Viewport>
    </>
  );
}

const styles = stylex.create({
  provider: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    minWidth: 0,
  },
  providerMarkContainer: {
    backgroundColor: `color-mix(in oklab, ${tokens.foreground} 4%, transparent)`,
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
