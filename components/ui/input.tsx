import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils/cn";

const fieldBase =
  "w-full rounded-md border border-input bg-card text-sm text-foreground shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60";

type BaseInputProps = InputHTMLAttributes<HTMLInputElement> & {
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, BaseInputProps>(function Input(
  { className, leftIcon, rightSlot, ...props },
  ref,
) {
  if (!leftIcon && !rightSlot) {
    return <input ref={ref} className={cn(fieldBase, "h-9 px-3", className)} {...props} />;
  }

  return (
    <div className="relative w-full">
      {leftIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {leftIcon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          fieldBase,
          "h-9",
          leftIcon ? "pl-9" : "pl-3",
          rightSlot ? "pr-9" : "pr-3",
          className,
        )}
        {...props}
      />
      {rightSlot && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{rightSlot}</span>
      )}
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(fieldBase, "h-9 appearance-none px-3 pr-9 cursor-pointer", className)}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(fieldBase, "min-h-28 resize-y px-3 py-2 leading-relaxed", className)}
        {...props}
      />
    );
  },
);

type LabelProps = {
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
};

export function Label({ htmlFor, children, hint, required, className }: LabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      <span className="flex items-center gap-1">
        {children}
        {required && <span className="text-destructive">*</span>}
      </span>
      {hint}
    </label>
  );
}
