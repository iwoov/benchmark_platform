"use client";

import { Check } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, checked, ...props },
  ref,
) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-foreground", className)}>
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          className={cn(
            "peer absolute inset-0 h-4 w-4 cursor-pointer appearance-none rounded border border-input bg-card transition-colors",
            "checked:border-primary checked:bg-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
          {...props}
        />
        <Check
          size={12}
          className="pointer-events-none relative z-10 hidden text-primary-foreground peer-checked:block"
          strokeWidth={3}
        />
      </span>
      {label && <span className="select-none">{label}</span>}
    </label>
  );
});
