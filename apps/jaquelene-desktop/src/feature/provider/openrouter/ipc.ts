import {
  OpenRouterConnection as OpenRouterConnectionIpc,
  OpenRouterConnectionState,
  OpenRouterConfigurationState,
  type OpenRouterConnectionStatus as IpcConnectionStatus,
  type OpenRouterConfiguration as IpcConfiguration,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type {
  OpenRouterConfiguration,
  OpenRouterConnection,
  OpenRouterConnectionStatus,
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

function toIpcStatus(status: OpenRouterConnectionStatus): IpcConnectionStatus {
  switch (status.state) {
    case "disconnected":
      return { state: OpenRouterConnectionState.Disconnected };
    case "connected":
      return {
        state: OpenRouterConnectionState.Connected,
        keyLabel: status.keyLabel,
      };
    case "rejected":
      return { state: OpenRouterConnectionState.Rejected };
    case "unavailable":
      return { state: OpenRouterConnectionState.Unavailable };
  }
}

export function exposeOpenRouterConnection(target: WebFrameMain, connection: OpenRouterConnection) {
  OpenRouterConnectionIpc.for(target).setImplementation({
    getConfiguration() {
      return toIpcConfiguration(connection.getConfiguration());
    },
    async connect(apiKey) {
      return toIpcStatus(await connection.connect(apiKey));
    },
    async disconnect() {
      return toIpcStatus(await connection.disconnect());
    },
  });
}
