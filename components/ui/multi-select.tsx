"use client";

import { Check, ChevronDown, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cn } from "@/lib/utils/cn";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiSelectProps = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "请选择",
  disabled,
  className,
  id,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.filter((o) => value.includes(o.value));

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  const remove = (v: string, e: ReactMouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((x) => x !== v));
  };

  const toggleOpen = () => {
    if (disabled) return;
    setOpen((o) => !o);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((o) => !o);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div
        id={id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-expanded={open}
        onClick={toggleOpen}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 text-left text-sm shadow-xs transition-[border-color,box-shadow] cursor-pointer",
          "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
          open && "border-ring ring-2 ring-ring/30",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {selected.length === 0 ? (
          <span className="px-1 text-muted-foreground">{placeholder}</span>
        ) : (
          selected.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
            >
              {opt.label}
              <button
                type="button"
                onClick={(e) => remove(opt.value, e)}
                className="rounded-sm hover:bg-primary/15"
                aria-label={`移除 ${opt.label}`}
              >
                <X size={12} />
              </button>
            </span>
          ))
        )}
        <ChevronDown
          size={14}
          className={cn(
            "ml-auto shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">无可选项</div>
          ) : (
            options.map((opt) => {
              const checked = value.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    checked && "bg-primary-soft/40 text-foreground",
                  )}
                >
                  <span className="grid h-4 w-4 place-items-center">
                    {checked && <Check size={14} className="text-primary" />}
                  </span>
                  <span>{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
