import {
  ProviderConfigurationKind,
  ProviderConfigurationState,
  ProviderConfigureState,
  type ApiKeyProviderConfiguration,
} from "@jaquelene/domain";
import type { Provider } from "@jaquelene/ipc/renderer";
import { Button, IconFrame, Input, Item, Ping } from "@jaquelene/ui";
import { ConfirmDialog } from "@jaquelene/ui/confirm-dialog";
import { colors, tokens } from "@jaquelene/ui/tokens.stylex";
import { VisuallyHidden } from "@ariakit/react/visually-hidden";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { ProviderMark } from "@/feature/provider/mark";
import {
  providersQuery,
  useClearProviderConfiguration,
  useConfigureProviderApiKey,
} from "@/feature/provider/query";
import { SettingsSubpageHeader } from "@/feature/settings/header";
import { ContentPane } from "@/layout/content-pane";

export const Route = createFileRoute("/settings/providers")({
  loader: ({ context }) => context.queryClient.query(providersQuery),
  component: ProvidersRoute,
});

function ProviderRow({
  provider,
  connected,
  actions,
}: {
  provider: Provider;
  connected: boolean;
  actions?: ReactNode;
}) {
  return (
    <Item.Root>
      <div {...stylex.props(styles.provider)}>
        <IconFrame style={styles.providerMarkContainer}>
          <ProviderMark brandId={provider.brandId} style={styles.providerMark} />
        </IconFrame>
        <Item.Content>
          <div {...stylex.props(styles.providerLabel)}>
            <Item.Label>{provider.name}</Item.Label>
            {connected && (
              <>
                <Ping style={styles.connected} />
                <VisuallyHidden>Connected</VisuallyHidden>
              </>
            )}
          </div>
        </Item.Content>
      </div>
      {actions}
    </Item.Root>
  );
}

function resolveApiKeyPlaceholder(configuration: ApiKeyProviderConfiguration): string {
  switch (configuration.state) {
    case ProviderConfigurationState.Configured:
      return configuration.keyLabel;
    case ProviderConfigurationState.Unconfigured:
      return "Paste API key";
  }
}

function ApiKeyProviderSettings({
  provider,
  configuration,
}: {
  provider: Provider;
  configuration: ApiKeyProviderConfiguration;
}) {
  const configureProvider = useConfigureProviderApiKey(provider.id);
  const clearProvider = useClearProviderConfiguration(provider.id);
  const [editingConnection, setEditingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const connectButton = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const errorId = useId();
  const connected = configuration.state === ProviderConfigurationState.Configured;
  const pending = configureProvider.isPending || clearProvider.isPending;
  const keyPlaceholder = resolveApiKeyPlaceholder(configuration);
  let disconnectError: string | undefined;
  let describedBy: string | undefined;
  let connectLabel = "Connect";
  let disconnectTrigger: ReactElement | null = null;

  if (clearProvider.isError) {
    disconnectError = `Couldn't disconnect ${provider.name}.`;
  }

  if (connectionError) {
    describedBy = errorId;
  }

  if (configureProvider.isPending) {
    connectLabel = "Connecting…";
  }

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
      setConnectionError("Enter an API key");
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
          setConnectionError(`${provider.name} rejected this API key`);
          return;
        case ProviderConfigureState.Unavailable:
          setConnectionError(`Couldn't reach ${provider.name}. Try again`);
          return;
      }
    } catch (cause) {
      reportError(`provider.${provider.id}.configure`, cause);
      setConnectionError(`Couldn't connect to ${provider.name}`);
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

  if (!editingConnection && connected) {
    disconnectTrigger = (
      <Button variant="ghost" tone="danger" disabled={pending}>
        Disconnect
      </Button>
    );
  }

  return (
    <>
      <ProviderRow
        provider={provider}
        connected={connected}
        actions={
          <div {...stylex.props(styles.actions)}>
            {!editingConnection && connected && (
              <Button variant="ghost" disabled={pending} onClick={startEditingConnection}>
                Manage
              </Button>
            )}

            <ConfirmDialog
              open={confirmingDisconnect}
              setOpen={setDisconnectConfirmationOpen}
              trigger={disconnectTrigger}
              heading={`Disconnect ${provider.name}?`}
              description="Removes your saved API key from this device."
              confirmLabel="Disconnect"
              pending={clearProvider.isPending}
              error={disconnectError}
              finalFocus={connectButton}
              onConfirm={() => void disconnect()}
            />

            {!editingConnection && !connected && (
              <Button ref={connectButton} disabled={pending} onClick={startEditingConnection}>
                Connect
              </Button>
            )}
          </div>
        }
      />

      {editingConnection && (
        <Item.Root render={<form noValidate onSubmit={connect} />} style={styles.form}>
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
                aria-describedby={describedBy}
                style={styles.input}
                placeholder={keyPlaceholder}
              />
              <Button type="submit" disabled={pending}>
                {connectLabel}
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

            {connectionError && (
              <p id={errorId} role="alert" {...stylex.props(styles.formError)}>
                {connectionError}
              </p>
            )}
          </div>
        </Item.Root>
      )}
    </>
  );
}

function ProviderSettings({ provider }: { provider: Provider }): ReactElement {
  switch (provider.configuration.kind) {
    case ProviderConfigurationKind.ApiKey:
      return <ApiKeyProviderSettings provider={provider} configuration={provider.configuration} />;
    case ProviderConfigurationKind.None:
      return <ProviderRow provider={provider} connected />;
  }
}

function ProvidersRoute() {
  const { data: providers } = useSuspenseQuery(providersQuery);

  return (
    <>
      <SettingsSubpageHeader page="Providers" />

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
    backgroundColor: colors.backgroundNeutralSubtlest,
    height: "2rem",
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
    color: colors.foregroundSuccess,
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
    color: colors.foregroundDanger,
    fontSize: tokens.fontSizeSmall,
    lineHeight: tokens.lineHeightSmall,
    marginTop: "0.5rem",
  },
});
