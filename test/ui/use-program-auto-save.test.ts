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

  it("retries every failed save after automatic backoff", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const noteSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(undefined);
    const nameSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("note:row-1", noteSave);
    });
    await act(async () => {
      await result.current.runSave("name", nameSave);
    });
    expect(noteSave).toHaveBeenCalledTimes(1);
    expect(nameSave).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("failed");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await waitFor(() => {
      expect(noteSave).toHaveBeenCalledTimes(2);
      expect(nameSave).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.state).toBe("saved");
    });
    vi.useRealTimers();
  });

  it("runs every failed save on tryAgain", async () => {
    const noteSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(undefined);
    const nameSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("note:row-1", noteSave);
    });
    await act(async () => {
      await result.current.runSave("name", nameSave);
    });
    act(() => {
      result.current.tryAgain();
    });
    await waitFor(() => {
      expect(noteSave).toHaveBeenCalledTimes(2);
      expect(nameSave).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.state).toBe("saved");
    });
  });

  it("stays saving when markSaved runs while a save is still in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finishSave: (() => void) | undefined;
    const slowSave = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            resolve();
          };
        }),
    );
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    act(() => {
      void result.current.runSave("note:row-1", slowSave);
    });
    expect(result.current.state).toBe("saving");
    act(() => {
      result.current.markSaved();
    });
    expect(result.current.state).toBe("saving");
    await act(async () => {
      finishSave!();
      await Promise.resolve();
    });
    expect(result.current.state).toBe("saved");
    vi.useRealTimers();
  });

  it("stays saving until every in-flight save finishes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finishFirst: (() => void) | undefined;
    const first = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = () => {
            resolve();
          };
        }),
    );
    const second = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    act(() => {
      void result.current.runSave("note:a", first);
    });
    act(() => {
      void result.current.runSave("note:b", second);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toBe("saving");
    await act(async () => {
      finishFirst!();
      await Promise.resolve();
    });
    expect(result.current.state).toBe("saved");
    vi.useRealTimers();
  });
});
