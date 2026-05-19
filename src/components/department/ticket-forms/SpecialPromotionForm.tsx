import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { cn } from "@/lib/utils";
import { VoiceDictation } from "./VoiceDictation";

interface SpecialPromotionFormProps {
  onChange: (description: string) => void;
}

export function SpecialPromotionForm({ onChange }: SpecialPromotionFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const parts = [
      `Title: ${title || "N/A"}`,
      `Description: ${description || "N/A"}`,
      `Start Date: ${startDate ? format(startDate, "PPP") : "N/A"}`,
      `End Date: ${endDate ? format(endDate, "PPP") : "Ongoing"}`,
      `Additional Notes: ${notes || "N/A"}`,
    ];
    onChange("Special Promotion:\n" + parts.join("\n"));
  }, [title, description, startDate, endDate, notes, onChange]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Title *</Label>
        <Input
          placeholder="e.g. Back-to-School Wellness Bundle"
          value={title}
          onChange={e => setTitle(e.target.value)}
         
        />
      </div>
      <div className="space-y-1.5">
        <Label>Description *</Label>
        <Textarea
          placeholder="What's included in the promotion?"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
         
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start Date *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "MMM d, yyyy") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label>End Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "MMM d, yyyy") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Additional Notes</Label>
        <Textarea
          placeholder="Any restrictions, terms, or extra details..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
         
        />
      </div>
    </div>
  );
}
