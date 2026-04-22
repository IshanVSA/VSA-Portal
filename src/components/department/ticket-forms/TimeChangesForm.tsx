import { useState, useEffect, useCallback } from "react";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { VoiceDictation } from "./VoiceDictation";

interface DaySchedule {
  open: boolean;
  openTime: string;
  closeTime: string;
}

type WeekSchedule = Record<string, DaySchedule>;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const defaultSchedule: WeekSchedule = Object.fromEntries(
  DAYS.map(day => [day, { open: day !== "Sunday", openTime: "09:00", closeTime: "17:00" }])
);

interface TimeChangesFormProps {
  onChange: (description: string) => void;
}

export function TimeChangesForm({ onChange }: TimeChangesFormProps) {
  const [schedule, setSchedule] = useState<WeekSchedule>(defaultSchedule);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date | undefined>(undefined);
  const [tempEndDate, setTempEndDate] = useState<Date | undefined>(undefined);
  const [statHolidayOpen, setStatHolidayOpen] = useState(false);
  const [statHolidayOpenTime, setStatHolidayOpenTime] = useState("09:00");
  const [statHolidayCloseTime, setStatHolidayCloseTime] = useState("17:00");

  useEffect(() => {
    const lines = DAYS.map(day => {
      const s = schedule[day];
      return s.open ? `${day}: ${s.openTime} - ${s.closeTime}` : `${day}: Closed`;
    });
    const datePart = [
      `Start Date: ${startDate ? format(startDate, "PPP") : "(not set)"}`,
      endDate ? `End Date: ${format(endDate, "PPP")}` : "End Date: Ongoing",
    ].join("\n");
    const statHolidayInfo = statHolidayOpen
      ? `Statutory Holidays: Open (${statHolidayOpenTime} - ${statHolidayCloseTime})`
      : "Statutory Holidays: Closed";
    onChange(`${datePart}\n\nUpdated Business Hours:\n${lines.join("\n")}\n\n${statHolidayInfo}`);
  }, [schedule, startDate, endDate, statHolidayOpen, statHolidayOpenTime, statHolidayCloseTime, onChange]);

  const update = (day: string, field: keyof DaySchedule, value: string | boolean) => {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.startDate) {
      try { setStartDate(parse(fields.startDate, "yyyy-MM-dd", new Date())); } catch {}
    }
    if (fields.endDate) {
      try { setEndDate(parse(fields.endDate, "yyyy-MM-dd", new Date())); } catch {}
    }

    const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    setSchedule(prev => {
      const next = { ...prev };
      dayKeys.forEach((key, i) => {
        const day = DAYS[i];
        if (fields[`${key}Closed`] === true) {
          next[day] = { ...next[day], open: false };
        } else {
          if (fields[`${key}Open`]) next[day] = { ...next[day], open: true, openTime: fields[`${key}Open`] };
          if (fields[`${key}Close`]) next[day] = { ...next[day], open: true, closeTime: fields[`${key}Close`] };
        }
      });
      return next;
    });

    if (fields.statHolidayOpen !== undefined) setStatHolidayOpen(fields.statHolidayOpen);
    if (fields.statHolidayOpenTime) setStatHolidayOpenTime(fields.statHolidayOpenTime);
    if (fields.statHolidayCloseTime) setStatHolidayCloseTime(fields.statHolidayCloseTime);
  }, []);

  return (
    <div className="space-y-4">
      <VoiceDictation formType="Time Changes" onFieldsExtracted={handleAutofill} />

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            Start Date <span className="text-destructive">*</span>
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-9 text-xs",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {startDate ? format(startDate, "PPP") : "Pick start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">End Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-9 text-xs",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {endDate ? format(endDate, "PPP") : "Ongoing"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                disabled={(date) =>
                  date < (startDate || new Date(new Date().setHours(0, 0, 0, 0)))
                }
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Schedule grid */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Business Hours</Label>
        <div className="space-y-2">
          {DAYS.map(day => (
            <div key={day} className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-muted/30 min-w-0">
              <div className="w-20 shrink-0 text-sm font-medium text-foreground truncate">{day}</div>
              <Switch
                checked={schedule[day].open}
                onCheckedChange={v => update(day, "open", v)}
                className="shrink-0"
              />
              <span className="text-xs text-muted-foreground w-10 shrink-0">
                {schedule[day].open ? "Open" : "Closed"}
              </span>
              {schedule[day].open && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Input
                    type="time"
                    value={schedule[day].openTime}
                    onChange={e => update(day, "openTime", e.target.value)}
                    className="w-24 h-8 text-xs min-w-0"
                  />
                  <span className="text-muted-foreground text-xs shrink-0">to</span>
                  <Input
                    type="time"
                    value={schedule[day].closeTime}
                    onChange={e => update(day, "closeTime", e.target.value)}
                    className="w-24 h-8 text-xs min-w-0"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stat Holiday Hours */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Statutory Holiday Hours</Label>
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-muted/30 min-w-0">
          <div className="w-20 shrink-0 text-sm font-medium text-foreground">Stat Holidays</div>
          <Switch
            checked={statHolidayOpen}
            onCheckedChange={setStatHolidayOpen}
            className="shrink-0"
          />
          <span className="text-xs text-muted-foreground w-10 shrink-0">
            {statHolidayOpen ? "Open" : "Closed"}
          </span>
          {statHolidayOpen && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Input
                type="time"
                value={statHolidayOpenTime}
                onChange={e => setStatHolidayOpenTime(e.target.value)}
                className="w-24 h-8 text-xs min-w-0"
              />
              <span className="text-muted-foreground text-xs shrink-0">to</span>
              <Input
                type="time"
                value={statHolidayCloseTime}
                onChange={e => setStatHolidayCloseTime(e.target.value)}
                className="w-24 h-8 text-xs min-w-0"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
