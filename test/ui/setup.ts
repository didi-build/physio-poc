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

ensureMatchMediaStub();
