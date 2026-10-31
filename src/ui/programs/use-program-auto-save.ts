import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveUiState = "idle" | "saving" | "saved" | "failed";

export type UseProgramAutoSaveOptions = {
  save: () => Promise<void>;
  debounceMs?: number;
};

export type UseProgramAutoSaveResult = {
  state: AutoSaveUiState;
  hasUnsavedEdits: boolean;
  markDirty: () => void;
  markSaved: () => void;
  tryAgain: () => void;
  failureAlertShown: boolean;
  publishAllowed: boolean;
  runSave: (task?: () => Promise<void>) => Promise<void>;
  scheduleDebouncedSave: (task: () => Promise<void>, debounceMs?: number) => void;
};

export function useProgramAutoSave({
  save,
  debounceMs = 100,
}: UseProgramAutoSaveOptions): UseProgramAutoSaveResult {
  const [state, setState] = useState<AutoSaveUiState>("saved");
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [failureAlertShown, setFailureAlertShown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const pendingTaskRef = useRef<(() => Promise<void>) | null>(null);

  const runSave = useCallback(async (task?: () => Promise<void>) => {
    const run = task ?? saveRef.current;
    setState("saving");
    try {
      await run();
      setState("saved");
      setHasUnsavedEdits(false);
      setFailureAlertShown(false);
    } catch {
      setState("failed");
      setFailureAlertShown(true);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      retryTimerRef.current = setTimeout(() => {
        void runSave(pendingTaskRef.current ?? undefined);
      }, 1500);
    }
  }, []);

  const scheduleDebouncedSave = useCallback(
    (task: () => Promise<void>, delayMs = debounceMs) => {
      pendingTaskRef.current = task;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        void runSave(task);
      }, delayMs);
    },
    [debounceMs, runSave],
  );

  const scheduleSave = useCallback(() => {
    scheduleDebouncedSave(saveRef.current);
  }, [scheduleDebouncedSave]);

  const markDirty = useCallback(() => {
    setHasUnsavedEdits(true);
    setState("saving");
    scheduleSave();
  }, [scheduleSave]);

  const markSaved = useCallback(() => {
    setHasUnsavedEdits(false);
    setState("saved");
  }, []);

  const tryAgain = useCallback(() => {
    void runSave(pendingTaskRef.current ?? undefined);
  }, [runSave]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
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
    markDirty,
    markSaved,
    tryAgain,
    failureAlertShown,
    publishAllowed,
    runSave,
    scheduleDebouncedSave,
  };
}
