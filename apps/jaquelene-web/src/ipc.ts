export function requireIpcMethod<Method>(method: Method | undefined): Method {
  if (typeof method !== "function") {
    throw new Error("The Jaquelene application IPC is unavailable.");
  }

  return method;
}
