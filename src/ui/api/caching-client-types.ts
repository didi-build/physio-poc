type CacheWrapMethodKeys<T> = {
  [K in keyof T]: K extends "fetchFn"
    ? never
    : T[K] extends (...args: never[]) => unknown
      ? K
      : never;
}[keyof T];

/** Public methods on API clients the cache wrapper must forward. */
export type CacheWrappedClient<T> = Pick<T, CacheWrapMethodKeys<T>>;
