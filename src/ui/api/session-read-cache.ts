/**
 * Bounded in-memory read cache for practitioner-scoped navigation GETs (DIDI-1185).
 * Session-only: no localStorage, service worker, or shared server cache.
 */

export type SessionReadCacheSuccess<T> = {
  kind: "success";
  data: T;
  updatedAt: number;
  retainedBytes: number;
};

export type SessionReadCacheKey = string;

export type SessionReadCacheFetchResult<T> =
  | { status: "ok"; data: T; fromCache: boolean }
  | { status: "error"; fromCache: boolean; hadValidCache: boolean }
  /** Response discarded (invalidation, session change, or in-flight cap); caller should retry without surfacing failure when possible. */
  | { status: "superseded"; hadValidCache: boolean };

export type SessionReadCacheLoader<T> = (signal?: AbortSignal) => Promise<T>;

export type SessionReadCacheOptions = {
  /** Maximum stored success entries (LRU eviction). */
  maxEntries?: number;
  /** Maximum concurrent distinct in-flight keys. */
  maxInFlight?: number;
  /** Approximate upper bound on JSON-serialized payload bytes retained in buckets. */
  maxRetainedBytes?: number;
  /** Upper bound on per-key invalidation generation tombstones (keys not in buckets or in-flight are dropped first). */
  maxKeyGenerationEntries?: number;
};

type CacheBucket<T = unknown> = SessionReadCacheSuccess<T>;

type InFlightEntry = {
  promise: Promise<unknown>;
  sessionEpoch: number;
  consumers: number;
  generation: number;
  abortController: AbortController;
};

export const DEFAULT_SESSION_READ_CACHE_MAX_ENTRIES = 192;
export const DEFAULT_SESSION_READ_CACHE_MAX_IN_FLIGHT = 32;
/** ~6 MiB JSON-ish payload budget across all success buckets (list snapshots dominate). */
export const DEFAULT_SESSION_READ_CACHE_MAX_RETAINED_BYTES = 6 * 1024 * 1024;
export const DEFAULT_SESSION_READ_CACHE_MAX_KEY_GENERATION_ENTRIES = 512;

function stableKeyPart(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableKeyPart(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${key}:${stableKeyPart(record[key])}`).join(",")}}`;
  }
  return String(value);
}

export function estimateSessionReadCachePayloadBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 1024;
  }
}

/** Build a deterministic practitioner-scoped cache key. */
export function buildSessionReadCacheKey(
  sessionEpoch: string,
  parts: Record<string, unknown>,
): SessionReadCacheKey {
  const resource = stableKeyPart(parts.resource);
  const rest = { ...parts };
  delete rest.resource;
  return `${sessionEpoch}|${resource}|${stableKeyPart(rest)}`;
}

export class SessionReadCache {
  private sessionEpoch = "";
  private sessionGeneration = 0;
  private readonly maxEntries: number;
  private readonly maxInFlight: number;
  private readonly maxRetainedBytes: number;
  private readonly maxKeyGenerationEntries: number;
  private readonly buckets = new Map<SessionReadCacheKey, CacheBucket>();
  private readonly lru: SessionReadCacheKey[] = [];
  private retainedBytes = 0;
  private readonly inFlight = new Map<SessionReadCacheKey, InFlightEntry>();
  private readonly keyInvalidationGeneration = new Map<SessionReadCacheKey, number>();

  constructor(options: SessionReadCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_SESSION_READ_CACHE_MAX_ENTRIES;
    this.maxInFlight = options.maxInFlight ?? DEFAULT_SESSION_READ_CACHE_MAX_IN_FLIGHT;
    this.maxRetainedBytes =
      options.maxRetainedBytes ?? DEFAULT_SESSION_READ_CACHE_MAX_RETAINED_BYTES;
    this.maxKeyGenerationEntries =
      options.maxKeyGenerationEntries ??
      DEFAULT_SESSION_READ_CACHE_MAX_KEY_GENERATION_ENTRIES;
  }

  getSessionEpoch(): string {
    return this.sessionEpoch;
  }

  /**
   * Replace session identity (practitioner switch, logout replacement, auth revoke).
   * Drops all buckets and in-flight bookkeeping for the prior session.
   */
  bindSession(practitionerId: string | null | undefined): void {
    const nextEpoch = practitionerId?.trim() ? practitionerId.trim() : "";
    if (nextEpoch === this.sessionEpoch) {
      return;
    }
    const previousEpoch = this.sessionEpoch;
    this.sessionEpoch = nextEpoch;
    this.sessionGeneration += 1;
    if (previousEpoch.length > 0) {
      this.clearAll();
    }
  }

  /** Test-only / full navigation reset within the same document. */
  clearAll(): void {
    for (const entry of this.inFlight.values()) {
      entry.abortController.abort();
    }
    this.buckets.clear();
    this.lru.length = 0;
    this.retainedBytes = 0;
    this.inFlight.clear();
    this.keyInvalidationGeneration.clear();
  }

  peekSuccess<T>(key: SessionReadCacheKey): SessionReadCacheSuccess<T> | null {
    if (!this.sessionEpoch) {
      return null;
    }
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.kind !== "success") {
      return null;
    }
    this.touchLru(key);
    return bucket as SessionReadCacheSuccess<T>;
  }

  /**
   * Read-through GET with in-flight dedupe. Valid hits do not revalidate in the background.
   */
  async fetch<T>(
    key: SessionReadCacheKey,
    loader: SessionReadCacheLoader<T>,
    options?: { force?: boolean },
  ): Promise<SessionReadCacheFetchResult<T>> {
    if (!this.sessionEpoch) {
      try {
        const data = await loader(new AbortController().signal);
        return { status: "ok", data, fromCache: false };
      } catch {
        return { status: "error", fromCache: false, hadValidCache: false };
      }
    }

    const force = options?.force === true;
    if (!force) {
      const hit = this.peekSuccess<T>(key);
      if (hit) {
        return { status: "ok", data: hit.data, fromCache: true };
      }
    }

    const existing = this.inFlight.get(key);
    if (existing && existing.sessionEpoch === this.sessionGeneration) {
      existing.consumers += 1;
      try {
        const data = (await existing.promise) as T;
        return { status: "ok", data, fromCache: false };
      } catch (error) {
        const hadValidCache = this.buckets.has(key);
        if (this.isSupersededError(error)) {
          const hit = this.peekSuccess<T>(key);
          if (hit) {
            return { status: "ok", data: hit.data, fromCache: true };
          }
          return { status: "superseded", hadValidCache };
        }
        const hit = this.peekSuccess<T>(key);
        if (hit) {
          return { status: "ok", data: hit.data, fromCache: true };
        }
        return { status: "error", fromCache: false, hadValidCache };
      } finally {
        existing.consumers = Math.max(0, existing.consumers - 1);
        this.maybeAbortIdleInFlight(key, existing);
      }
    }

    if (this.inFlight.size >= this.maxInFlight) {
      this.evictOldestInFlight();
    }

    const captureGeneration = this.sessionGeneration;
    const keyGen = this.keyInvalidationGeneration.get(key) ?? 0;
    const hadValidCache = !force && this.buckets.has(key);

    const abortController = new AbortController();
    const promise = (async () => {
      try {
        const data = await loader(abortController.signal);
        if (abortController.signal.aborted) {
          throw new SessionReadCacheAbortedError();
        }
        if (
          captureGeneration !== this.sessionGeneration ||
          (this.keyInvalidationGeneration.get(key) ?? 0) !== keyGen
        ) {
          throw new SessionReadCacheStaleError();
        }
        this.putSuccess(key, data);
        return data;
      } catch (error) {
        if (this.isAbortError(error) || error instanceof SessionReadCacheAbortedError) {
          throw new SessionReadCacheSupersededError();
        }
        throw error;
      }
    })();

    const entry: InFlightEntry = {
      promise,
      sessionEpoch: captureGeneration,
      consumers: 1,
      generation: keyGen,
      abortController,
    };
    this.inFlight.set(key, entry);

    try {
      const data = (await promise) as T;
      return { status: "ok", data, fromCache: false };
    } catch (error) {
      if (this.isSupersededError(error)) {
        const hit = this.peekSuccess<T>(key);
        if (hit) {
          return { status: "ok", data: hit.data, fromCache: true };
        }
        return { status: "superseded", hadValidCache };
      }
      const hit = this.peekSuccess<T>(key);
      if (hit) {
        return { status: "ok", data: hit.data, fromCache: true };
      }
      return { status: "error", fromCache: false, hadValidCache };
    } finally {
      const current = this.inFlight.get(key);
      if (current?.promise === promise) {
        this.inFlight.delete(key);
      }
      entry.consumers = Math.max(0, entry.consumers - 1);
      this.maybeAbortIdleInFlight(key, entry);
    }
  }

  /** Decrement in-flight consumer count (e.g. hook unmount). May abort the network read when no consumers remain. */
  releaseInFlightConsumer(key: SessionReadCacheKey): void {
    const entry = this.inFlight.get(key);
    if (!entry) {
      return;
    }
    entry.consumers = Math.max(0, entry.consumers - 1);
    this.maybeAbortIdleInFlight(key, entry);
  }

  invalidate(keys: Iterable<SessionReadCacheKey>): void {
    for (const key of keys) {
      this.buckets.delete(key);
      const idx = this.lru.indexOf(key);
      if (idx >= 0) {
        this.lru.splice(idx, 1);
      }
      this.bumpKeyGeneration(key);
    }
    this.recomputeRetainedBytes();
  }

  invalidateMatching(predicate: (key: SessionReadCacheKey) => boolean): void {
    const toDrop: SessionReadCacheKey[] = [];
    for (const key of this.buckets.keys()) {
      if (predicate(key)) {
        toDrop.push(key);
      }
    }
    for (const key of this.inFlight.keys()) {
      if (predicate(key)) {
        toDrop.push(key);
      }
    }
    this.invalidate(toDrop);
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
  }

  private isSupersededError(error: unknown): boolean {
    return (
      error instanceof SessionReadCacheStaleError ||
      error instanceof SessionReadCacheSupersededError
    );
  }

  private maybeAbortIdleInFlight(key: SessionReadCacheKey, entry: InFlightEntry): void {
    if (entry.consumers > 0) {
      return;
    }
    const current = this.inFlight.get(key);
    if (current?.abortController === entry.abortController) {
      entry.abortController.abort();
    }
  }

  private bumpKeyGeneration(key: SessionReadCacheKey): void {
    const next = (this.keyInvalidationGeneration.get(key) ?? 0) + 1;
    this.keyInvalidationGeneration.set(key, next);
    const inflight = this.inFlight.get(key);
    if (inflight) {
      inflight.abortController.abort();
      this.inFlight.delete(key);
    }
    this.pruneKeyGenerations();
  }

  private pruneKeyGenerations(): void {
    if (this.keyInvalidationGeneration.size <= this.maxKeyGenerationEntries) {
      return;
    }
    const protectedKeys = new Set<SessionReadCacheKey>();
    for (const key of this.buckets.keys()) {
      protectedKeys.add(key);
    }
    for (const key of this.inFlight.keys()) {
      protectedKeys.add(key);
    }
    for (const key of this.keyInvalidationGeneration.keys()) {
      if (this.keyInvalidationGeneration.size <= this.maxKeyGenerationEntries) {
        break;
      }
      if (!protectedKeys.has(key)) {
        this.keyInvalidationGeneration.delete(key);
      }
    }
  }

  private putSuccess<T>(key: SessionReadCacheKey, data: T): void {
    const retainedBytes = estimateSessionReadCachePayloadBytes(data);
    const previous = this.buckets.get(key);
    if (previous) {
      this.retainedBytes = Math.max(0, this.retainedBytes - previous.retainedBytes);
    }
    this.buckets.set(key, {
      kind: "success",
      data,
      updatedAt: Date.now(),
      retainedBytes,
    });
    this.retainedBytes += retainedBytes;
    this.touchLru(key);
    while (this.lru.length > this.maxEntries) {
      this.evictOldestBucket();
    }
    while (this.retainedBytes > this.maxRetainedBytes && this.lru.length > 0) {
      this.evictOldestBucket();
    }
  }

  private evictOldestBucket(): void {
    const oldest = this.lru.shift();
    if (!oldest) {
      return;
    }
    const bucket = this.buckets.get(oldest);
    if (bucket) {
      this.retainedBytes = Math.max(0, this.retainedBytes - bucket.retainedBytes);
    }
    this.buckets.delete(oldest);
  }

  private recomputeRetainedBytes(): void {
    let total = 0;
    for (const bucket of this.buckets.values()) {
      total += bucket.retainedBytes;
    }
    this.retainedBytes = total;
  }

  private touchLru(key: SessionReadCacheKey): void {
    const idx = this.lru.indexOf(key);
    if (idx >= 0) {
      this.lru.splice(idx, 1);
    }
    this.lru.push(key);
  }

  private evictOldestInFlight(): void {
    const first = this.inFlight.keys().next().value as SessionReadCacheKey | undefined;
    if (first) {
      this.bumpKeyGeneration(first);
    }
  }
}

export class SessionReadCacheStaleError extends Error {
  constructor() {
    super("Session read cache response superseded");
    this.name = "SessionReadCacheStaleError";
  }
}

export class SessionReadCacheSupersededError extends Error {
  constructor() {
    super("Session read cache in-flight superseded");
    this.name = "SessionReadCacheSupersededError";
  }
}

class SessionReadCacheAbortedError extends Error {
  constructor() {
    super("Session read cache request aborted");
    this.name = "SessionReadCacheAbortedError";
  }
}

let defaultCache: SessionReadCache | null = null;

export function getSessionReadCache(): SessionReadCache {
  defaultCache ??= new SessionReadCache();
  return defaultCache;
}

export function setSessionReadCacheForTests(cache: SessionReadCache | null): void {
  defaultCache = cache;
}

export function resetSessionReadCacheForTests(): void {
  defaultCache?.clearAll();
  defaultCache?.bindSession("");
}
