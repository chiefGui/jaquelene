import {
  OpenRouterConnection as OpenRouterConnectionIpc,
  OpenRouterConnectState,
  OpenRouterConfigurationState,
  type OpenRouterConnectResult as IpcConnectResult,
  type OpenRouterConfiguration as IpcConfiguration,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type {
  OpenRouterConfiguration,
  OpenRouterConnection,
  OpenRouterConnectResult,
} from "./connection";

function toIpcConfiguration(configuration: OpenRouterConfiguration): IpcConfiguration {
  switch (configuration.state) {
    case "disconnected":
      return { state: OpenRouterConfigurationState.Disconnected };
    case "configured":
      return {
        state: OpenRouterConfigurationState.Configured,
        ...(configuration.keyLabel ? { keyLabel: configuration.keyLabel } : {}),
      };
  }
}

function toIpcConnectResult(result: OpenRouterConnectResult): IpcConnectResult {
  switch (result.state) {
    case "connected":
      return {
        state: OpenRouterConnectState.Connected,
        keyLabel: result.keyLabel,
      };
    case "rejected":
      return { state: OpenRouterConnectState.Rejected };
    case "unavailable":
      return { state: OpenRouterConnectState.Unavailable };
  }
}

export function exposeOpenRouterConnection(target: WebFrameMain, connection: OpenRouterConnection) {
  OpenRouterConnectionIpc.for(target).setImplementation({
    getConfiguration() {
      return toIpcConfiguration(connection.getConfiguration());
    },
    async connect(apiKey) {
      return toIpcConnectResult(await connection.connect(apiKey));
    },
    disconnect() {
      return connection.disconnect();
    },
  });
}
