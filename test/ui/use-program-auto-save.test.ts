/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProgramAutoSave } from "../../src/ui/programs/use-program-auto-save.js";

describe("useProgramAutoSave (unit)", () => {
  it("retries the same failed task after automatic backoff", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const nameSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    act(() => {
      result.current.scheduleDebouncedSave("name", nameSave);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(result.current.state).toBe("failed");
    expect(nameSave).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await waitFor(() => {
      expect(nameSave).toHaveBeenCalledTimes(2);
    });
    vi.useRealTimers();
  });

  it("keeps pending keys separate so one field does not cancel another", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    act(() => {
      result.current.scheduleDebouncedSave("note:a", first);
      result.current.scheduleDebouncedSave("note:b", second);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    await waitFor(() => {
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });
    expect(result.current.state).toBe("saved");
    vi.useRealTimers();
  });

  it("does not show saved while another key is still pending", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const nameSave = vi.fn().mockResolvedValue(undefined);
    const noteSave = vi.fn().mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    act(() => {
      result.current.scheduleDebouncedSave("note:1", noteSave);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(result.current.state).toBe("saving");
    act(() => {
      result.current.scheduleDebouncedSave("name", nameSave);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(nameSave).toHaveBeenCalled();
    expect(result.current.state).toBe("saving");
    vi.useRealTimers();
  });

  it("does not clear a failure when a different key saves successfully", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("fail"));
    const ok = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("reorder", fail);
    });
    expect(result.current.state).toBe("failed");
    await act(async () => {
      await result.current.runSave("name", ok);
    });
    expect(result.current.state).toBe("failed");
    expect(fail).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
