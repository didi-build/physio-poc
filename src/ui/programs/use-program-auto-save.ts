import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveUiState = "idle" | "saving" | "saved" | "failed";

export type UseProgramAutoSaveOptions = {
  debounceMs?: number;
};

type FailedSave = {
  key: string;
  run: () => Promise<void>;
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
  const failedSaveRef = useRef<FailedSave | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncUi = useCallback(() => {
    const hasPending = pendingKeysRef.current.size > 0;
    const failed = failedSaveRef.current !== null;
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

  const runSave = useCallback(
    async (key: string, task: () => Promise<void>) => {
      const timer = timersRef.current.get(key);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(key);
      }
      inFlightRef.current += 1;
      syncUi();
      try {
        await task();
        pendingKeysRef.current.delete(key);
        if (failedSaveRef.current?.key === key) {
          failedSaveRef.current = null;
          setFailureAlertShown(false);
        }
      } catch {
        failedSaveRef.current = { key, run: task };
        setFailureAlertShown(true);
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = setTimeout(() => {
          const failed = failedSaveRef.current;
          if (failed) {
            void runSave(failed.key, failed.run);
          }
        }, 1500);
      } finally {
        inFlightRef.current -= 1;
        syncUi();
      }
    },
    [syncUi],
  );

  const scheduleDebouncedSave = useCallback(
    (key: string, task: () => Promise<void>) => {
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
    failedSaveRef.current = null;
    setFailureAlertShown(false);
    inFlightRef.current = 0;
    setState("saved");
    setHasUnsavedEdits(false);
  }, []);

  const tryAgain = useCallback(() => {
    const failed = failedSaveRef.current;
    if (failed) {
      void runSave(failed.key, failed.run);
    }
  }, [runSave]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

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
