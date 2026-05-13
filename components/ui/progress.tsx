import { cn } from "@/lib/utils/cn";

type ProgressProps = {
  value: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "destructive";
  size?: "sm" | "md";
  className?: string;
  showLabel?: boolean;
};

const toneClasses: Record<NonNullable<ProgressProps["tone"]>, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

export function Progress({
  value,
  max = 100,
  tone = "primary",
  size = "md",
  className,
  showLabel = false,
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-1.5" : "h-2",
        )}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", toneClasses[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="min-w-[2.5rem] text-right text-xs font-medium tabular-nums text-muted-foreground">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
