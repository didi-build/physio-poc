/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProgramAutoSave } from "../../src/ui/programs/use-program-auto-save.js";

describe("useProgramAutoSave (unit)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
  });

  it("uses exponential auto retry delays of 1.5s doubling up to a 30s cap", async () => {
    vi.useFakeTimers();
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
  });

  it("resets auto retry backoff after a failed save succeeds", async () => {
    vi.useFakeTimers();
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
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(4);
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
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(6);
  });

  it("resets auto retry backoff when Try again is pressed", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));

    await act(async () => {
      await result.current.runSave("name", save);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(3);

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
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(5);
  });

  it("does not overlap auto retries while a retry save is still in flight", async () => {
    vi.useFakeTimers();
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
  });

  it("D03: sends the latest value after several debounced edits while a save is in flight", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finishFirst: (() => void) | undefined;
    const saved: string[] = [];
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
        saved.push("a");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        saved.push("ab");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        saved.push("abc");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    await act(async () => {
      finishFirst!();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(saved).toEqual(["a", "abc"]);
    });
    expect(result.current.state).toBe("saved");
  });

  it("D08 and D09: saves the deferred newer value after an in-flight failure without re-sending stale data", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finishV2: (() => void) | undefined;
    const order: string[] = [];
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("reorder-rows", async () => {
        order.push("v1");
        throw new Error("fail v1");
      });
    });
    act(() => {
      void result.current.runSave("reorder-rows", async () => {
        order.push("v2");
        await new Promise<void>((resolve) => {
          finishV2 = () => {
            resolve();
          };
        });
        throw new Error("fail v2");
      });
      void result.current.runSave("reorder-rows", async () => {
        order.push("v3");
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(order).toEqual(["v1", "v2"]);
    await act(async () => {
      finishV2!();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(order).toEqual(["v1", "v2", "v3"]);
    });
    expect(result.current.state).toBe("saved");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(order).toEqual(["v1", "v2", "v3"]);
  });

  it("R61c: does not duplicate the latest debounced save when auto retry fires during an in-flight save", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finishAb: (() => void) | undefined;
    const sent: string[] = [];
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        sent.push("a");
        throw new Error("fail a");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(sent).toEqual(["a"]);
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        sent.push("ab");
        await new Promise<void>((resolve) => {
          finishAb = resolve;
        });
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(sent).toEqual(["a", "ab"]);
    await act(async () => {
      finishAb!();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(sent).toEqual(["a", "ab"]);
    });
  });

  it("kills stale auto retry overwriting a deferred newer direct save (D8)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finishV2: (() => void) | undefined;
    const order: string[] = [];
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("reorder-rows", async () => {
        order.push("v1");
        throw new Error("fail");
      });
    });
    act(() => {
      void result.current.runSave("reorder-rows", async () => {
        order.push("v2");
        await new Promise<void>((resolve) => {
          finishV2 = resolve;
        });
        throw new Error("fail v2");
      });
      void result.current.runSave("reorder-rows", async () => {
        order.push("v3");
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await act(async () => {
      finishV2!();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(order).toEqual(["v1", "v2", "v3"]);
    });
    expect(order.at(-1)).toBe("v3");
  });

  it("N4 and N5: runs exactly one retry when Try again is pressed twice during an in-flight retry that then succeeds", async () => {
    let finishRetry: (() => void) | undefined;
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishRetry = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("name", save);
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
    await act(async () => {
      finishRetry!();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.state).toBe("saved");
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("resets auto retry backoff after markSaved", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 10 }));
    await act(async () => {
      await result.current.runSave("name", save);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(3);
    act(() => {
      result.current.markSaved();
    });
    await act(async () => {
      await result.current.runSave("name", save);
    });
    const callsBeforeBackoff = save.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(save).toHaveBeenCalledTimes(callsBeforeBackoff);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(callsBeforeBackoff + 1);
  });

  it("does not schedule auto retry after unmount when an in-flight save fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let failInFlight: (() => void) | undefined;
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          failInFlight = () => {
            reject(new Error("fail"));
          };
        }),
    );
    const { result, unmount } = renderHook(() =>
      useProgramAutoSave({ debounceMs: 10 }),
    );
    act(() => {
      void result.current.runSave("name", save);
    });
    unmount();
    await act(async () => {
      failInFlight!();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("D03 exact: newest debounced value wins over deferred task (debounceMs 100)", async () => {
    vi.useFakeTimers();
    let finishA: (() => void) | undefined;
    const saved: string[] = [];
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 100 }));
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        await new Promise<void>((resolve) => {
          finishA = resolve;
        });
        saved.push("a");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        saved.push("ab");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        saved.push("abc");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      finishA!();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.state).toBe("saving");
    expect(result.current.hasUnsavedEdits).toBe(true);
    expect(result.current.publishAllowed).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saved).toEqual(["a", "abc"]);
    expect(result.current.state).toBe("saved");
    expect(result.current.hasUnsavedEdits).toBe(false);
    expect(result.current.publishAllowed).toBe(true);
  });

  it("D03: stays saving until debounced edit lands after in-flight save completes", async () => {
    vi.useFakeTimers();
    let finishA: (() => void) | undefined;
    const saved: string[] = [];
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 100 }));
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        await new Promise<void>((resolve) => {
          finishA = resolve;
        });
        saved.push("a");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        saved.push("ab");
      });
    });
    await act(async () => {
      finishA!();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saved).toEqual(["a"]);
    expect(result.current.state).toBe("saving");
    expect(result.current.hasUnsavedEdits).toBe(true);
    expect(result.current.publishAllowed).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saved).toEqual(["a", "ab"]);
    expect(result.current.state).toBe("saved");
  });

  it("D08/D09: Try again does not clobber a newer debounced edit", async () => {
    vi.useFakeTimers();
    let rejectHeld: ((error: Error) => void) | undefined;
    const namePayloads: string[] = [];
    const abSave = vi.fn().mockImplementation(async () => {
      namePayloads.push("ab");
    });
    const saveA = vi
      .fn()
      .mockImplementationOnce(async () => {
        namePayloads.push("a");
        throw new Error("fail");
      })
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            rejectHeld = reject;
          }),
      );
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 100 }));
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        await saveA();
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saveA).toHaveBeenCalledTimes(1);
    expect(namePayloads).toEqual(["a"]);
    act(() => {
      result.current.tryAgain();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveA).toHaveBeenCalledTimes(2);
    act(() => {
      result.current.scheduleDebouncedSave("name", abSave);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      rejectHeld!(new Error("retry fail"));
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      result.current.tryAgain();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(namePayloads).toEqual(["a", "ab"]);
    expect(saveA).toHaveBeenCalledTimes(2);
    expect(abSave).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("saved");
  });

  it("NW1: debounced edit replaces failed task before auto retry fires", async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const save = vi
      .fn()
      .mockImplementationOnce(async (label: string) => {
        saved.push(label);
        throw new Error("fail");
      })
      .mockImplementation(async (label: string) => {
        saved.push(label);
      });
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 100 }));
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        await save("a");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(saved).toEqual(["a"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1450);
    });
    act(() => {
      result.current.scheduleDebouncedSave("name", async () => {
        await save("ab");
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(saved).toEqual(["a", "ab"]);
    expect(result.current.state).toBe("saved");
  });

  it("NW4: auto retry sends the latest failed reorder task", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const { result } = renderHook(() => useProgramAutoSave({ debounceMs: 100 }));
    await act(async () => {
      await result.current.runSave("reorder-rows", async () => {
        order.push("v1");
        throw new Error("fail v1");
      });
    });
    await act(async () => {
      await result.current.runSave("reorder-rows", async () => {
        order.push("v2");
        throw new Error("fail v2");
      });
    });
    expect(order).toEqual(["v1", "v2"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(order).toEqual(["v1", "v2", "v2"]);
    expect(order.at(-1)).toBe("v2");
  });

  it("UM6: unmount flushes exactly one save with the newest deferred value", async () => {
    vi.useFakeTimers();
    let finishV1: (() => void) | undefined;
    const order: string[] = [];
    const { result, unmount } = renderHook(() =>
      useProgramAutoSave({ debounceMs: 100 }),
    );
    act(() => {
      void result.current.runSave("reorder-rows", async () => {
        order.push("v1");
        await new Promise<void>((resolve) => {
          finishV1 = resolve;
        });
      });
    });
    act(() => {
      void result.current.runSave("reorder-rows", async () => {
        order.push("v2");
      });
    });
    unmount();
    await act(async () => {
      finishV1!();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(order).toEqual(["v1", "v2"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(order).toEqual(["v1", "v2"]);
  });

  it("UM6: failed unmount flush does not retry", async () => {
    vi.useFakeTimers();
    let finishV1: (() => void) | undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishV1 = () => {
              resolve();
            };
          }),
      )
      .mockRejectedValue(new Error("flush fail"));
    const { result, unmount } = renderHook(() =>
      useProgramAutoSave({ debounceMs: 100 }),
    );
    act(() => {
      void result.current.runSave("name", save);
    });
    act(() => {
      result.current.scheduleDebouncedSave("name", save);
    });
    unmount();
    await act(async () => {
      finishV1!();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("UM6: unmount with no unsaved edits sends no save", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() =>
      useProgramAutoSave({ debounceMs: 100 }),
    );
    act(() => {
      result.current.scheduleDebouncedSave("name", save);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
