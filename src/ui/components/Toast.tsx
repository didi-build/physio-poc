import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TOAST_UNDO } from "../copy/nav.js";

export type ToastPayload = {
  message: string;
  onUndo?: () => void | Promise<void>;
  /** Failed-save styling per design/app/shared-load-states/spec.md */
  variant?: "default" | "alert";
};

type ToastContextValue = {
  showToast: (payload: ToastPayload) => void;
  dismissToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  const dismissToast = useCallback(() => {
    setToast(null);
    setUndoBusy(false);
  }, []);

  const showToast = useCallback((payload: ToastPayload) => {
    setUndoBusy(false);
    setToast(payload);
  }, []);

  useEffect(() => {
    if (!toast) {
      setUndoBusy(false);
      return;
    }
    const delayMs = toast.onUndo ? 5000 : 2600;
    const timer = window.setTimeout(() => {
      setToast(null);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live={toast?.variant === "alert" ? undefined : "polite"}
        aria-atomic="true"
        role={toast?.variant === "alert" ? "alert" : undefined}
        className={
          toast
            ? `shell-toast${toast.variant === "alert" ? " shell-toast--alert" : ""}`
            : "shell-toast-live sr-only"
        }
      >
        {toast ? (
          <>
            <span className="shell-toast-message">{toast.message}</span>
            {toast.onUndo ? (
              <button
                type="button"
                className="shell-toast-undo"
                disabled={undoBusy}
                aria-busy={undoBusy}
                onClick={() => {
                  if (undoBusy) {
                    return;
                  }
                  setUndoBusy(true);
                  const result = toast.onUndo?.();
                  if (result && typeof (result as Promise<void>).then === "function") {
                    void (result as Promise<void>)
                      .then(() => {
                        dismissToast();
                      })
                      .catch(() => {
                        setUndoBusy(false);
                      });
                    return;
                  }
                  setUndoBusy(false);
                  dismissToast();
                }}
              >
                {TOAST_UNDO}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
