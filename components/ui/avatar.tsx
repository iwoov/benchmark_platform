import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type AvatarProps = HTMLAttributes<HTMLSpanElement> & {
  size?: number;
  fallback?: string;
};

export function Avatar({ className, size = 36, fallback, children, style, ...props }: AvatarProps) {
  const initials = fallback?.slice(0, 1).toUpperCase();
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] text-sm font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {children ?? initials}
    </span>
  );
}
