import {
  OpenRouterConnection as OpenRouterConnectionIpc,
  OpenRouterConnectionState,
  type OpenRouterConnectionStatus as IpcConnectionStatus,
} from "@jaquelene/ipc/main";
import type { WebFrameMain } from "electron";
import type { OpenRouterConnection, OpenRouterConnectionStatus } from "./connection";

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
    async getStatus() {
      return toIpcStatus(await connection.getStatus());
    },
    async connect(apiKey) {
      return toIpcStatus(await connection.connect(apiKey));
    },
    async disconnect() {
      return toIpcStatus(await connection.disconnect());
    },
  });
}
