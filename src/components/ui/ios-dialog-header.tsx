import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * iOS modal header: Cancel (left) — Title (center) — Action (right).
 * Designed to sit at the top of a Dialog/Sheet content area without a border.
 */
interface Props {
  title: React.ReactNode;
  cancelLabel?: string;
  actionLabel?: string;
  onCancel?: () => void;
  onAction?: () => void;
  loading?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  className?: string;
}

export function IOSDialogHeader({
  title,
  cancelLabel = "Cancel",
  actionLabel,
  onCancel,
  onAction,
  loading,
  disabled,
  destructive,
  className,
}: Props) {
  return (
    <div className={cn("relative flex items-center justify-between h-12 px-4", className)}>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="text-[15px] text-primary font-normal hover:opacity-70 transition-opacity"
        >
          {cancelLabel}
        </button>
      ) : <span />}
      <div className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold tracking-tight truncate max-w-[55%] text-center">
        {title}
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          disabled={disabled || loading}
          onClick={onAction}
          className={cn(
            "text-[15px] font-semibold hover:opacity-70 transition-opacity disabled:opacity-40 flex items-center gap-1.5",
            destructive ? "text-destructive" : "text-primary",
          )}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : actionLabel}
        </button>
      ) : <span />}
    </div>
  );
}
