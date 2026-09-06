import type { Effect } from "effect";

export type CacheAddress = Readonly<{
  namespace: string;
  scope: string;
  key: string;
}>;

export type CacheSelector = Readonly<{
  namespace?: string;
  scope?: string;
  key?: string;
}>;

export type StoredCacheEntry = CacheAddress &
  Readonly<{
    codecVersion: number;
    payload: Uint8Array;
    payloadBytes: number;
    storedAt: number;
    discardAt: number;
    revision: number;
  }>;

export type CacheStoreInspection = Readonly<{
  entries: number;
  logicalBytes: number;
  revision: number;
}>;

export type CacheStore = Readonly<{
  read: (address: CacheAddress) => Effect.Effect<StoredCacheEntry | undefined, unknown>;
  write: (entry: StoredCacheEntry) => Effect.Effect<void, unknown>;
  delete: (selector: CacheSelector, revision: number) => Effect.Effect<void, unknown>;
  clear: (revision: number) => Effect.Effect<void, unknown>;
  inspect: (selector?: CacheSelector) => Effect.Effect<CacheStoreInspection, unknown>;
}>;

export function cacheAddressKey({ namespace, scope, key }: CacheAddress) {
  return JSON.stringify([namespace, scope, key]);
}

export function cacheAddressMatches(address: CacheAddress, selector: CacheSelector) {
  return (
    (selector.namespace === undefined || selector.namespace === address.namespace) &&
    (selector.scope === undefined || selector.scope === address.scope) &&
    (selector.key === undefined || selector.key === address.key)
  );
}
