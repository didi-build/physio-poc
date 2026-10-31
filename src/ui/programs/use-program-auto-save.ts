import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_SAVE_RETRY_INITIAL_MS = 1500;
const AUTO_SAVE_RETRY_MAX_MS = 30_000;

export type AutoSaveUiState = "idle" | "saving" | "saved" | "failed";

export type UseProgramAutoSaveOptions = {
  debounceMs?: number;
};

export type UseProgramAutoSaveResult = {
  state: AutoSaveUiState;
  hasUnsavedEdits: boolean;
  markSaved: () => void;
  tryAgain: () => void;
  failureAlertShown: boolean;
  publishAllowed: boolean;
  scheduleDebouncedSave: (key: string, task: () => Promise<void>) => void;
  runSave: (key: string, task: () => Promise<void>) => Promise<void>;
};

type RunSaveOptions = {
  clearDebounce?: boolean;
  allowRetryOnFailure?: boolean;
};

export function useProgramAutoSave({
  debounceMs = 100,
}: UseProgramAutoSaveOptions = {}): UseProgramAutoSaveResult {
  const [state, setState] = useState<AutoSaveUiState>("saved");
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [failureAlertShown, setFailureAlertShown] = useState(false);
  const pendingKeysRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const inFlightRef = useRef(0);
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const deferredTaskRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const failedSavesRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const latestTaskByKeyRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const editGenerationByKeyRef = useRef<Map<string, number>>(new Map());
  const savedGenerationByKeyRef = useRef<Map<string, number>>(new Map());
  const unmountFlushTaskRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayMsRef = useRef(AUTO_SAVE_RETRY_INITIAL_MS);
  const activeRef = useRef(true);

  const resetRetryBackoff = useCallback(() => {
    retryDelayMsRef.current = AUTO_SAVE_RETRY_INITIAL_MS;
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const syncUi = useCallback(() => {
    if (!activeRef.current) {
      return;
    }
    const hasPending = pendingKeysRef.current.size > 0;
    const failed = failedSavesRef.current.size > 0;
    setHasUnsavedEdits(hasPending || failed);
    if (inFlightRef.current > 0) {
      setState("saving");
      return;
    }
    if (failed) {
      setState("failed");
      return;
    }
    if (hasPending) {
      setState("saving");
      return;
    }
    setState("saved");
  }, []);

  const runSaveRef = useRef<
    | ((
        key: string,
        task: () => Promise<void>,
        options?: RunSaveOptions,
      ) => Promise<void>)
    | undefined
  >(undefined);

  const shouldSkipAutomaticRetryForKey = useCallback((key: string) => {
    return (
      inFlightKeysRef.current.has(key) ||
      deferredTaskRef.current.has(key) ||
      timersRef.current.has(key)
    );
  }, []);

  const scheduleFailedRetries = useCallback(() => {
    if (!activeRef.current) {
      return;
    }
    clearRetryTimer();
    const delay = retryDelayMsRef.current;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (!activeRef.current) {
        return;
      }
      retryDelayMsRef.current = Math.min(
        retryDelayMsRef.current * 2,
        AUTO_SAVE_RETRY_MAX_MS,
      );
      for (const [key, run] of failedSavesRef.current.entries()) {
        if (shouldSkipAutomaticRetryForKey(key)) {
          continue;
        }
        void runSaveRef.current?.(key, run, { allowRetryOnFailure: true });
      }
    }, delay);
  }, [clearRetryTimer, shouldSkipAutomaticRetryForKey]);

  const runSaveOnceAfterUnmount = useCallback(
    async (key: string, task: () => Promise<void>) => {
      if (inFlightKeysRef.current.has(key)) {
        unmountFlushTaskRef.current.set(key, task);
        return;
      }
      pendingKeysRef.current.add(key);
      inFlightKeysRef.current.add(key);
      inFlightRef.current += 1;
      try {
        await task();
        const generation = editGenerationByKeyRef.current.get(key) ?? 0;
        savedGenerationByKeyRef.current.set(key, generation);
        pendingKeysRef.current.delete(key);
        failedSavesRef.current.delete(key);
      } catch {
        // No retries after unmount.
      } finally {
        inFlightKeysRef.current.delete(key);
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        pendingKeysRef.current.delete(key);
      }
    },
    [],
  );

  const runSave = useCallback(
    async (key: string, task: () => Promise<void>, options: RunSaveOptions = {}) => {
      const { clearDebounce = false, allowRetryOnFailure = true } = options;

      if (inFlightKeysRef.current.has(key)) {
        deferredTaskRef.current.set(key, task);
        latestTaskByKeyRef.current.set(key, task);
        editGenerationByKeyRef.current.set(
          key,
          (editGenerationByKeyRef.current.get(key) ?? 0) + 1,
        );
        if (failedSavesRef.current.has(key)) {
          failedSavesRef.current.set(key, task);
        }
        pendingKeysRef.current.add(key);
        syncUi();
        return;
      }

      if (clearDebounce) {
        const timer = timersRef.current.get(key);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(key);
        }
      }

      pendingKeysRef.current.add(key);
      inFlightKeysRef.current.add(key);
      inFlightRef.current += 1;
      syncUi();
      try {
        await task();
        const generation = editGenerationByKeyRef.current.get(key) ?? 0;
        const latest = latestTaskByKeyRef.current.get(key);
        const hasNewerQueued =
          deferredTaskRef.current.has(key) ||
          timersRef.current.has(key) ||
          (latest !== undefined && latest !== task);
        if (!hasNewerQueued) {
          savedGenerationByKeyRef.current.set(key, generation);
        }
        if (!timersRef.current.has(key) && !deferredTaskRef.current.has(key)) {
          pendingKeysRef.current.delete(key);
        }
        if (failedSavesRef.current.delete(key)) {
          resetRetryBackoff();
          if (failedSavesRef.current.size === 0) {
            setFailureAlertShown(false);
            clearRetryTimer();
          } else if (activeRef.current) {
            scheduleFailedRetries();
          }
        }
      } catch {
        if (activeRef.current && allowRetryOnFailure) {
          if (!timersRef.current.has(key)) {
            failedSavesRef.current.set(key, task);
          }
          setFailureAlertShown(true);
          scheduleFailedRetries();
        }
      } finally {
        inFlightKeysRef.current.delete(key);
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        syncUi();
        if (!activeRef.current) {
          const flushTask = unmountFlushTaskRef.current.get(key);
          if (flushTask) {
            unmountFlushTaskRef.current.delete(key);
            void runSaveOnceAfterUnmount(key, flushTask);
          }
        } else if (timersRef.current.has(key)) {
          deferredTaskRef.current.delete(key);
        } else {
          const deferred = deferredTaskRef.current.get(key);
          if (deferred) {
            deferredTaskRef.current.delete(key);
            void runSave(key, deferred, { allowRetryOnFailure: true });
          }
        }
      }
    },
    [
      clearRetryTimer,
      resetRetryBackoff,
      runSaveOnceAfterUnmount,
      scheduleFailedRetries,
      syncUi,
    ],
  );

  runSaveRef.current = runSave;

  const scheduleDebouncedSave = useCallback(
    (key: string, task: () => Promise<void>) => {
      latestTaskByKeyRef.current.set(key, task);
      editGenerationByKeyRef.current.set(
        key,
        (editGenerationByKeyRef.current.get(key) ?? 0) + 1,
      );
      if (failedSavesRef.current.has(key)) {
        failedSavesRef.current.set(key, task);
      }
      pendingKeysRef.current.add(key);
      syncUi();
      const existing = timersRef.current.get(key);
      if (existing) {
        clearTimeout(existing);
      }
      timersRef.current.set(
        key,
        setTimeout(() => {
          timersRef.current.delete(key);
          void runSave(key, task, { clearDebounce: true, allowRetryOnFailure: true });
        }, debounceMs),
      );
    },
    [debounceMs, runSave, syncUi],
  );

  const markSaved = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
    pendingKeysRef.current.clear();
    deferredTaskRef.current.clear();
    failedSavesRef.current.clear();
    latestTaskByKeyRef.current.clear();
    editGenerationByKeyRef.current.clear();
    savedGenerationByKeyRef.current.clear();
    unmountFlushTaskRef.current.clear();
    setFailureAlertShown(false);
    clearRetryTimer();
    resetRetryBackoff();
    syncUi();
  }, [clearRetryTimer, resetRetryBackoff, syncUi]);

  const tryAgain = useCallback(() => {
    clearRetryTimer();
    resetRetryBackoff();
    for (const [key, run] of failedSavesRef.current.entries()) {
      if (shouldSkipAutomaticRetryForKey(key)) {
        continue;
      }
      void runSave(key, run, { allowRetryOnFailure: true });
    }
  }, [clearRetryTimer, resetRetryBackoff, runSave, shouldSkipAutomaticRetryForKey]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
      clearRetryTimer();

      const keysToConsider = new Set<string>([
        ...pendingKeysRef.current,
        ...deferredTaskRef.current.keys(),
        ...latestTaskByKeyRef.current.keys(),
        ...unmountFlushTaskRef.current.keys(),
      ]);

      for (const key of keysToConsider) {
        const latest = latestTaskByKeyRef.current.get(key);
        if (latest === undefined) {
          continue;
        }
        const generation = editGenerationByKeyRef.current.get(key) ?? 0;
        const savedGeneration = savedGenerationByKeyRef.current.get(key) ?? 0;
        if (generation <= savedGeneration) {
          continue;
        }
        void runSaveOnceAfterUnmount(key, latest);
      }
    };
  }, [clearRetryTimer, runSaveOnceAfterUnmount]);

  const publishAllowed = state === "saved" && !hasUnsavedEdits;

  return {
    state,
    hasUnsavedEdits,
    markSaved,
    tryAgain,
    failureAlertShown,
    publishAllowed,
    scheduleDebouncedSave,
    runSave,
  };
}
