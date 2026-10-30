/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProgramAutoSave } from "../../src/ui/programs/use-program-auto-save.js";

describe("useProgramAutoSave (unit)", () => {
  it("retries automatically after failure and exposes Try again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ save, debounceMs: 10 }));
    act(() => {
      result.current.markDirty();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(result.current.state).toBe("failed");
    expect(result.current.failureAlertShown).toBe(true);
    expect(result.current.publishAllowed).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(2);
    });
    vi.useRealTimers();
  });
});
