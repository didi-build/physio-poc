/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openShareLinkPageForPrint } from "../../src/ui/programs/program-share-download.js";

describe("openShareLinkPageForPrint (DIDI-1014)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the public link URL and triggers print on load", () => {
    const print = vi.fn();
    const opened = {
      print,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "load") {
          handler();
        }
      }),
      document: { readyState: "loading" },
    };
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(opened as unknown as Window);
    openShareLinkPageForPrint("https://physio.test.example/l/token-abc");
    expect(openSpy).toHaveBeenCalledWith(
      "https://physio.test.example/l/token-abc",
      "_blank",
      "noopener,noreferrer",
    );
    expect(print).toHaveBeenCalled();
  });
});
