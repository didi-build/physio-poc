import { useEffect, useState } from "react";

/** Debounce a value for search-driven cache keys (DIDI-1188). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => {
      window.clearTimeout(handle);
    };
  }, [delayMs, value]);
  return debounced;
}
