import { useSyncExternalStore } from "react";

const MIN_WIDTH_1024_QUERY = "(min-width: 1024px)";

function subscribeMinWidth1024(onStoreChange: () => void) {
  if (typeof window.matchMedia !== "function") {
    return () => {};
  }
  const media = window.matchMedia(MIN_WIDTH_1024_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => {
    media.removeEventListener("change", onStoreChange);
  };
}

function getMinWidth1024Snapshot() {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(MIN_WIDTH_1024_QUERY).matches;
}

function getMinWidth1024ServerSnapshot() {
  return false;
}

/** True when the programs builder uses the desktop publish card layout (1024px and up). */
export function useMinWidth1024(): boolean {
  return useSyncExternalStore(
    subscribeMinWidth1024,
    getMinWidth1024Snapshot,
    getMinWidth1024ServerSnapshot,
  );
}
