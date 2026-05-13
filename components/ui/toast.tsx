"use client";

import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

export type ToastTone = "info" | "success" | "warning" | "error";

export type ToastInput = {
  title?: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  duration?: number;
};

type Toast = ToastInput & {
  id: number;
  tone: ToastTone;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  success: (input: Omit<ToastInput, "tone">) => void;
  error: (input: Omit<ToastInput, "tone">) => void;
  warning: (input: Omit<ToastInput, "tone">) => void;
  info: (input: Omit<ToastInput, "tone">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneConfig: Record<ToastTone, { icon: typeof Info; className: string; iconClass: string }> = {
  info: {
    icon: Info,
    className: "border-info/40 bg-info-soft",
    iconClass: "text-info",
  },
  success: {
    icon: CheckCircle2,
    className: "border-success/40 bg-success-soft",
    iconClass: "text-success",
  },
  warning: {
    icon: TriangleAlert,
    className: "border-warning/40 bg-warning-soft",
    iconClass: "text-warning",
  },
  error: {
    icon: XCircle,
    className: "border-destructive/40 bg-destructive-soft",
    iconClass: "text-destructive",
  },
};

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      idRef.current += 1;
      const id = idRef.current;
      const tone: ToastTone = input.tone ?? "info";
      const duration = input.duration ?? 4000;
      setToasts((prev) => [...prev, { ...input, id, tone }]);
      if (duration > 0) {
        setTimeout(() => remove(id), duration);
      }
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (i) => toast({ ...i, tone: "success" }),
      error: (i) => toast({ ...i, tone: "error" }),
      warning: (i) => toast({ ...i, tone: "warning" }),
      info: (i) => toast({ ...i, tone: "info" }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => {
          const cfg = toneConfig[t.tone];
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg animate-fade-in",
                cfg.className,
              )}
            >
              <Icon size={18} className={cn("mt-0.5 shrink-0", cfg.iconClass)} />
              <div className="min-w-0 flex-1 space-y-0.5">
                {t.title && <p className="text-sm font-semibold text-foreground">{t.title}</p>}
                {t.description && (
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="关闭通知"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <Toaster>");
  }
  return ctx;
}
