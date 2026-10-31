import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

function ensureMatchMediaStub() {
  if (typeof window.matchMedia !== "function") {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  }
}

export { ensureMatchMediaStub };

const MIN_WIDTH_1024_QUERY = "(min-width: 1024px)";

/** Stub matchMedia for programs builder breakpoint tests. */
export function mockMinWidth1024(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return query === MIN_WIDTH_1024_QUERY ? matches : false;
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_event: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: vi.fn(),
    })),
  );
  return {
    setMatches(next: boolean) {
      matches = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

ensureMatchMediaStub();
