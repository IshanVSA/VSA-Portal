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

interface BoostFormProps {
  onChange: (description: string) => void;
}

export function BoostForm({ onChange }: BoostFormProps) {
  const [concerns, setConcerns] = useState("");
  const [service, setService] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const parts = [
      `Issues / Concerns: ${concerns || "N/A"}`,
      `Service to Promote: ${service || "N/A"}`,
      `Start Date: ${startDate ? format(startDate, "PPP") : "N/A"}`,
      `End Date: ${endDate ? format(endDate, "PPP") : "N/A"}`,
      `Additional Notes: ${notes || "N/A"}`,
    ];
    onChange("Boost Request:\n" + parts.join("\n"));
  }, [concerns, service, startDate, endDate, notes, onChange]);

  return (
    <div className="space-y-3">
      <VoiceDictation
        formType="Boost"
        onFieldsExtracted={(f) => {
          if (f.concerns) setConcerns(f.concerns);
          if (f.service) setService(f.service);
          if (f.notes) setNotes(f.notes);
          try {
            if (f.startDate) setStartDate(parse(f.startDate, "yyyy-MM-dd", new Date()));
            if (f.endDate) setEndDate(parse(f.endDate, "yyyy-MM-dd", new Date()));
          } catch {}
        }}
      />
      <div className="space-y-1.5">
        <Label>Tell us your issues / concerns *</Label>
        <Textarea
          placeholder="What's not getting the traction you'd like? What's the goal of this boost?"
          value={concerns}
          onChange={e => setConcerns(e.target.value)}
          rows={3}
         
        />
      </div>

      <div className="space-y-1.5">
        <Label>Special service to be promoted *</Label>
        <Input
          placeholder="e.g. Senior wellness exam, dental month..."
          value={service}
          onChange={e => setService(e.target.value)}
         
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
          <Label>End Date *</Label>
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
          placeholder="Anything else we should know?"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
         
        />
      </div>
    </div>
  );
}
