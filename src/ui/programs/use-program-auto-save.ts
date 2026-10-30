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

  const runSave = useCallback(async () => {
    setState("saving");
    try {
      await saveRef.current();
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
        void runSave();
      }, 1500);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      void runSave();
    }, debounceMs);
  }, [debounceMs, runSave]);

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
    void runSave();
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
  };
}
