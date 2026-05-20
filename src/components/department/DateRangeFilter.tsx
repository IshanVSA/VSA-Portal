import { useState } from "react";
import { format, subDays, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeFilterProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  presets?: { label: string; days: number }[];
  className?: string;
  referenceDate?: Date;
}

const DEFAULT_PRESETS = [
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

export function DateRangeFilter({
  dateRange,
  onDateRangeChange,
  presets = DEFAULT_PRESETS,
  className,
  referenceDate = new Date(),
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const totalDays = differenceInDays(dateRange.to, dateRange.from) + 1;
  const isToday = format(dateRange.to, "yyyy-MM-dd") === format(referenceDate, "yyyy-MM-dd");
  const activePreset = presets.find((p) => p.days === totalDays && isToday);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* Segmented preset buttons */}
      <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
        {presets.map((preset) => (
          <button
            key={preset.days}
            onClick={() =>
              onDateRangeChange({
                from: subDays(referenceDate, preset.days - 1),
                to: referenceDate,
              })
            }
            className={cn(
              "relative px-3 py-1.5 text-xs font-medium rounded-xl transition-all duration-200",
              activePreset?.days === preset.days
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom range picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-xs font-medium transition-all",
              !activePreset
                ? "border-primary/60 bg-primary/5 text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>
              {format(dateRange.from, "MMM d")} – {format(dateRange.to, "MMM d, yyyy")}
            </span>
            <ChevronDown className={cn("h-3 w-3 opacity-50 transition-transform", open && "rotate-180")} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
          <div className="p-3 pb-0">
            <p className="text-xs font-medium text-muted-foreground mb-1">Select date range</p>
          </div>
          <Calendar
            mode="range"
            selected={{ from: dateRange.from, to: dateRange.to }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                onDateRangeChange({ from: range.from, to: range.to });
                setOpen(false);
              } else if (range?.from) {
                onDateRangeChange({ from: range.from, to: range.from });
              }
            }}
            disabled={(date) => date > referenceDate}
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <span className="text-[11px] text-muted-foreground">
              {totalDays} day{totalDays !== 1 ? "s" : ""} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onDateRangeChange({
                  from: subDays(referenceDate, 29),
                  to: referenceDate,
                });
                setOpen(false);
              }}
            >
              Reset to 30D
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
