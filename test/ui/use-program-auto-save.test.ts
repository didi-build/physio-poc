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

  it("runs a failed save only once when Try again is pressed twice while retry is in flight", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("add-exercise", save);
    });
    expect(save).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.tryAgain();
      result.current.tryAgain();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("runs a failed save only once when Try again and the auto retry timer both fire", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("add-exercise", save);
    });
    expect(save).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.tryAgain();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(save).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("keeps the failure alert while another key is still failed after a different key saves", async () => {
    const fail = vi.fn().mockRejectedValue(new Error("fail"));
    const ok = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("note:row-1", fail);
    });
    await act(async () => {
      await result.current.runSave("name", fail);
    });
    expect(result.current.failureAlertShown).toBe(true);
    await act(async () => {
      await result.current.runSave("reorder-rows", ok);
    });
    expect(result.current.state).toBe("failed");
    expect(result.current.failureAlertShown).toBe(true);
    expect(fail).toHaveBeenCalledTimes(2);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("saves the latest debounced value after an in-flight save for the same key", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finishFirst: (() => void) | undefined;
    const saved: string[] = [];
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    act(() => {
      result.current.scheduleDebouncedSave("note:1", async () => {
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
        saved.push("a");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(result.current.state).toBe("saving");
    act(() => {
      result.current.scheduleDebouncedSave("note:1", async () => {
        saved.push("ab");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(result.current.state).toBe("saving");
    expect(saved).toEqual([]);
    await act(async () => {
      finishFirst!();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(saved).toEqual(["a", "ab"]);
    });
    expect(result.current.state).toBe("saved");
    expect(result.current.hasUnsavedEdits).toBe(false);
    vi.useRealTimers();
  });

  it("clears only the key that succeeded on retry and keeps other failed saves", async () => {
    const noteSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(undefined);
    const nameSave = vi.fn().mockRejectedValue(new Error("still fail"));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("note:row-1", noteSave);
    });
    await act(async () => {
      await result.current.runSave("name", nameSave);
    });
    expect(result.current.state).toBe("failed");
    await act(async () => {
      await result.current.runSave("note:row-1", noteSave);
    });
    expect(noteSave).toHaveBeenCalledTimes(2);
    expect(nameSave).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("failed");
    expect(result.current.failureAlertShown).toBe(true);
  });

  it("retries the latest debounced value after the field is edited again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    act(() => {
      result.current.scheduleDebouncedSave("note:row-1", async () => {
        await save("first");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(save).toHaveBeenCalledWith("first");
    act(() => {
      result.current.scheduleDebouncedSave("note:row-1", async () => {
        await save("second");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(save).toHaveBeenCalledWith("second");
    act(() => {
      result.current.tryAgain();
    });
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(3);
    });
    expect(save.mock.calls[2]).toEqual(["second"]);
    vi.useRealTimers();
  });

  it("clears failures and blocks auto retry after markSaved", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("name", save);
    });
    expect(result.current.failureAlertShown).toBe(true);
    act(() => {
      result.current.markSaved();
    });
    expect(result.current.failureAlertShown).toBe(false);
    expect(result.current.state).toBe("saved");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not auto retry after unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi.fn().mockRejectedValue(new Error("fail"));
    const { result, unmount } = renderHook(() =>
      useProgramAutoSave({ debounceMs: 10 }),
    );
    await act(async () => {
      await result.current.runSave("name", save);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("uses exponential auto retry delays of 1.5s doubling up to a 30s cap", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    const expectedDelays = [1500, 3000, 6000, 12000, 24000, 30000, 30000] as const;

    await act(async () => {
      await result.current.runSave("name", save);
    });
    expect(save).toHaveBeenCalledTimes(1);

    for (let i = 0; i < expectedDelays.length; i += 1) {
      const delayMs = expectedDelays[i]!;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delayMs - 1);
      });
      expect(save).toHaveBeenCalledTimes(i + 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(save).toHaveBeenCalledTimes(i + 2);
    }
    vi.useRealTimers();
  });

  it("resets auto retry backoff after a failed save succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockRejectedValueOnce(new Error("c"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("d"));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));

    await act(async () => {
      await result.current.runSave("name", save);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(4));
    expect(result.current.state).toBe("saved");

    await act(async () => {
      await result.current.runSave("name", save);
    });
    expect(save).toHaveBeenCalledTimes(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(save).toHaveBeenCalledTimes(5);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(6));
    vi.useRealTimers();
  });

  it("resets auto retry backoff when Try again is pressed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const save = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));

    await act(async () => {
      await result.current.runSave("name", save);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));

    act(() => {
      result.current.tryAgain();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(4);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(save).toHaveBeenCalledTimes(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(5));
    vi.useRealTimers();
  });

  it("does not overlap auto retries while a retry save is still in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finishRetry: (() => void) | undefined;
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            finishRetry = () => {
              reject(new Error("still fail"));
            };
          }),
      )
      .mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));

    await act(async () => {
      await result.current.runSave("name", save);
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => {
      finishRetry!();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(save).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
