/**
 * Bounded in-memory read cache for practitioner-scoped navigation GETs (DIDI-1185).
 * Session-only: no localStorage, service worker, or shared server cache.
 */

export type SessionReadCacheSuccess<T> = {
  kind: "success";
  data: T;
  updatedAt: number;
};

export type SessionReadCacheKey = string;

export type SessionReadCacheFetchResult<T> =
  | { status: "ok"; data: T; fromCache: boolean }
  | { status: "error"; fromCache: boolean; hadValidCache: boolean };

export type SessionReadCacheOptions = {
  /** Maximum stored success entries (LRU eviction). */
  maxEntries?: number;
  /** Maximum concurrent distinct in-flight keys. */
  maxInFlight?: number;
};

type CacheBucket<T = unknown> = SessionReadCacheSuccess<T>;

type InFlightEntry = {
  promise: Promise<unknown>;
  sessionEpoch: number;
  consumers: number;
  generation: number;
};

export const DEFAULT_SESSION_READ_CACHE_MAX_ENTRIES = 192;
export const DEFAULT_SESSION_READ_CACHE_MAX_IN_FLIGHT = 32;

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
  private readonly buckets = new Map<SessionReadCacheKey, CacheBucket>();
  private readonly lru: SessionReadCacheKey[] = [];
  private readonly inFlight = new Map<SessionReadCacheKey, InFlightEntry>();
  private readonly keyInvalidationGeneration = new Map<SessionReadCacheKey, number>();

  constructor(options: SessionReadCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_SESSION_READ_CACHE_MAX_ENTRIES;
    this.maxInFlight = options.maxInFlight ?? DEFAULT_SESSION_READ_CACHE_MAX_IN_FLIGHT;
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
    this.buckets.clear();
    this.lru.length = 0;
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
    loader: () => Promise<T>,
    options?: { force?: boolean },
  ): Promise<SessionReadCacheFetchResult<T>> {
    if (!this.sessionEpoch) {
      try {
        const data = await loader();
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
      } catch {
        const hadValidCache = this.buckets.has(key);
        return { status: "error", fromCache: false, hadValidCache };
      } finally {
        existing.consumers = Math.max(0, existing.consumers - 1);
      }
    }

    if (this.inFlight.size >= this.maxInFlight) {
      this.evictOldestInFlight();
    }

    const captureGeneration = this.sessionGeneration;
    const keyGen = this.keyInvalidationGeneration.get(key) ?? 0;
    const hadValidCache = !force && this.buckets.has(key);

    const promise = (async () => {
      const data = await loader();
      if (
        captureGeneration !== this.sessionGeneration ||
        (this.keyInvalidationGeneration.get(key) ?? 0) !== keyGen
      ) {
        throw new SessionReadCacheStaleError();
      }
      this.putSuccess(key, data);
      return data;
    })();

    const entry: InFlightEntry = {
      promise,
      sessionEpoch: captureGeneration,
      consumers: 1,
      generation: keyGen,
    };
    this.inFlight.set(key, entry);

    try {
      const data = (await promise) as T;
      return { status: "ok", data, fromCache: false };
    } catch (error) {
      if (error instanceof SessionReadCacheStaleError) {
        const hit = this.peekSuccess<T>(key);
        if (hit) {
          return { status: "ok", data: hit.data, fromCache: true };
        }
      }
      return { status: "error", fromCache: false, hadValidCache };
    } finally {
      const current = this.inFlight.get(key);
      if (current?.promise === promise) {
        this.inFlight.delete(key);
      }
    }
  }

  releaseInFlightConsumer(key: SessionReadCacheKey): void {
    const entry = this.inFlight.get(key);
    if (!entry) {
      return;
    }
    entry.consumers = Math.max(0, entry.consumers - 1);
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

  private bumpKeyGeneration(key: SessionReadCacheKey): void {
    const next = (this.keyInvalidationGeneration.get(key) ?? 0) + 1;
    this.keyInvalidationGeneration.set(key, next);
    this.inFlight.delete(key);
  }

  private putSuccess<T>(key: SessionReadCacheKey, data: T): void {
    this.buckets.set(key, {
      kind: "success",
      data,
      updatedAt: Date.now(),
    });
    this.touchLru(key);
    while (this.lru.length > this.maxEntries) {
      const oldest = this.lru.shift();
      if (oldest) {
        this.buckets.delete(oldest);
      }
    }
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
      this.inFlight.delete(first);
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
