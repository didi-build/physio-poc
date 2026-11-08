/** Optional abort for navigation GET calls (DIDI-1185 session read cache). */
export type ReadRequestOptions = {
  signal?: AbortSignal;
};

export function readGetInit(options?: ReadRequestOptions): RequestInit {
  return options?.signal
    ? { method: "GET", signal: options.signal }
    : { method: "GET" };
}
