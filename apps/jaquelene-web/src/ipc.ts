export function requireIpcMethod<Method>(method: Method | undefined): Method {
  if (typeof method !== "function") {
    throw new Error("The Jaquelene application IPC is unavailable.");
  }

  return method;
}

export const ipcQueryOptions = {
  networkMode: "always",
  retry: false,
  staleTime: Infinity,
} as const;

export const ipcMutationOptions = {
  networkMode: "always",
  retry: false,
} as const;
