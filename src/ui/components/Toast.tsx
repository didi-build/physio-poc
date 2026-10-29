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
  onUndo?: () => void;
};

type ToastContextValue = {
  showToast: (payload: ToastPayload) => void;
  dismissToast: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback((payload: ToastPayload) => {
    setToast(payload);
  }, []);

  useEffect(() => {
    if (!toast) {
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
        aria-live="polite"
        aria-atomic="true"
        className={toast ? "shell-toast" : "shell-toast-live sr-only"}
      >
        {toast ? (
          <>
            <span className="shell-toast-message">{toast.message}</span>
            {toast.onUndo ? (
              <button
                type="button"
                className="shell-toast-undo"
                onClick={() => {
                  toast.onUndo?.();
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
