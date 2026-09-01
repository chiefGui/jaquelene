import { ErrorSeverity } from "@jaquelene/diagnostics";
import { Usage } from "@jaquelene/ipc/renderer";
import type { QueryClient } from "@tanstack/react-query";
import { reportError } from "@/feature/diagnostics/diagnostics";
import { requireIpcMethod } from "@/ipc";
import { usageQueryKey } from "./query";

const onUsageChanged = requireIpcMethod(Usage?.onChanged);

export function installUsageEvents(queryClient: QueryClient) {
  return onUsageChanged(() => {
    void queryClient
      .invalidateQueries({ queryKey: usageQueryKey })
      .catch((error: unknown) => reportError("usage.synchronize", error, ErrorSeverity.Warning));
  });
}
