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
    ((key: string, task: () => Promise<void>) => Promise<void>) | undefined
  >(undefined);

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
        if (inFlightKeysRef.current.has(key)) {
          continue;
        }
        if (deferredTaskRef.current.has(key)) {
          continue;
        }
        void runSaveRef.current?.(key, run);
      }
    }, delay);
  }, [clearRetryTimer]);

  const runSave = useCallback(
    async (key: string, task: () => Promise<void>) => {
      if (inFlightKeysRef.current.has(key)) {
        deferredTaskRef.current.set(key, task);
        if (failedSavesRef.current.has(key)) {
          failedSavesRef.current.set(key, task);
        }
        pendingKeysRef.current.add(key);
        syncUi();
        return;
      }
      const timer = timersRef.current.get(key);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(key);
      }
      pendingKeysRef.current.add(key);
      inFlightKeysRef.current.add(key);
      inFlightRef.current += 1;
      syncUi();
      try {
        await task();
        pendingKeysRef.current.delete(key);
        if (failedSavesRef.current.delete(key)) {
          resetRetryBackoff();
          if (failedSavesRef.current.size === 0) {
            setFailureAlertShown(false);
            clearRetryTimer();
          } else {
            scheduleFailedRetries();
          }
        }
      } catch {
        if (activeRef.current) {
          failedSavesRef.current.set(key, task);
          setFailureAlertShown(true);
          scheduleFailedRetries();
        }
      } finally {
        inFlightKeysRef.current.delete(key);
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        syncUi();
        if (activeRef.current) {
          const deferred = deferredTaskRef.current.get(key);
          if (deferred) {
            deferredTaskRef.current.delete(key);
            void runSave(key, deferred);
          }
        }
      }
    },
    [clearRetryTimer, resetRetryBackoff, scheduleFailedRetries, syncUi],
  );

  runSaveRef.current = runSave;

  const scheduleDebouncedSave = useCallback(
    (key: string, task: () => Promise<void>) => {
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
          void runSave(key, task);
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
    setFailureAlertShown(false);
    clearRetryTimer();
    resetRetryBackoff();
    syncUi();
  }, [clearRetryTimer, resetRetryBackoff, syncUi]);

  const tryAgain = useCallback(() => {
    clearRetryTimer();
    resetRetryBackoff();
    for (const [key, run] of failedSavesRef.current.entries()) {
      if (inFlightKeysRef.current.has(key)) {
        continue;
      }
      void runSave(key, run);
    }
  }, [clearRetryTimer, resetRetryBackoff, runSave]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

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
