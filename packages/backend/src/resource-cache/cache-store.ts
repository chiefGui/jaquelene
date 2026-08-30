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
  read: (address: CacheAddress) => Promise<StoredCacheEntry | undefined>;
  write: (entry: StoredCacheEntry) => Promise<void>;
  delete: (selector: CacheSelector, revision: number) => Promise<void>;
  clear: (revision: number) => Promise<void>;
  inspect: (selector?: CacheSelector) => Promise<CacheStoreInspection>;
  close: () => Promise<void>;
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
