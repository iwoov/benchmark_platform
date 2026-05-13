"use client";

import { cn } from "@/lib/utils/cn";

export type SegmentedOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: React.ReactNode;
};

type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: SegmentedProps<T>) {
  const height = size === "sm" ? "h-8" : "h-9";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-muted p-1",
        height,
        className,
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 text-sm font-medium transition-colors cursor-pointer",
              size === "sm" ? "h-6 text-xs" : "h-7",
              active
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
