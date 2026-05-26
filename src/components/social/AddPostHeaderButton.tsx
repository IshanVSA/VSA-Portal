import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { useSM2Posts } from "@/hooks/useSM2Posts";

interface Props {
  generationId: string;
  /** "YYYY-MM" — the month the generation belongs to. */
  monthYear: string;
  disabled?: boolean;
}

export default function AddPostHeaderButton({ generationId, monthYear, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const { addPost } = useSM2Posts(generationId);

  const { monthStart, monthEnd, defaultMonth } = useMemo(() => {
    const [y, m] = monthYear.split("-").map(Number);
    const start = new Date(y, (m || 1) - 1, 1);
    const end = new Date(y, m || 1, 0); // last day of month
    return { monthStart: start, monthEnd: end, defaultMonth: start };
  }, [monthYear]);

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const scheduledDate = format(date, "yyyy-MM-dd");
    addPost.mutate(
      { scheduledDate },
      {
        onSuccess: () => setOpen(false),
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={disabled || addPost.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
          {addPost.isPending ? "Adding..." : "Add Post"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="px-3 pt-3 pb-1 text-xs text-muted-foreground">
          Pick a date in {format(monthStart, "MMMM yyyy")}
        </div>
        <Calendar
          mode="single"
          defaultMonth={defaultMonth}
          fromDate={monthStart}
          toDate={monthEnd}
          onSelect={handleSelect}
          initialFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
