"use client";

import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";

export type ModalProps = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
  bodyClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  hideCloseButton?: boolean;
  children: ReactNode;
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  width = 520,
  className,
  bodyClassName,
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  children,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => onOpenChange?.(false), [onOpenChange]);

  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeOnEsc, close]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  const handleBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && closeOnBackdrop) close();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 px-4 py-6 backdrop-blur-sm animate-fade-in"
      onMouseDown={handleBackdrop}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "relative flex w-full max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl",
          className,
        )}
        style={{ maxWidth: typeof width === "number" ? `${width}px` : width }}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-3.5">
            <div className="min-w-0 flex-1 space-y-0.5">
              {title && <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
