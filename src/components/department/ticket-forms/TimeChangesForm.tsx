import { useState, useEffect, useCallback } from "react";
import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VoiceDictation } from "./VoiceDictation";

// Generate 30-min interval options: 00:00, 00:30, 01:00, ... 23:30
const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

function TimeSelect({ value, onChange, className, invalid }: { value: string; onChange: (v: string) => void; className?: string; invalid?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-24 h-8 text-xs", invalid && "border-destructive focus:ring-destructive", className)}>
        <SelectValue placeholder="00:00" />
      </SelectTrigger>
      <SelectContent className="max-h-60 bg-popover z-50">
        {TIME_OPTIONS.map((t) => (
          <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface DaySchedule {
  open: boolean;
  openTime: string;
  closeTime: string;
}

type WeekSchedule = Record<string, DaySchedule>;

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const defaultSchedule: WeekSchedule = Object.fromEntries(
  DAYS.map(day => [day, { open: day !== "Sunday", openTime: "00:00", closeTime: "00:00" }])
);

interface TimeChangesFormProps {
  onChange: (description: string) => void;
  socialEnabled?: boolean;
}

export function TimeChangesForm({ onChange, socialEnabled = true }: TimeChangesFormProps) {
  const [schedule, setSchedule] = useState<WeekSchedule>(defaultSchedule);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date | undefined>(undefined);
  const [tempEndDate, setTempEndDate] = useState<Date | undefined>(undefined);
  const [statHolidayOpen, setStatHolidayOpen] = useState(false);
  const [statHolidayOpenTime, setStatHolidayOpenTime] = useState("00:00");
  const [statHolidayCloseTime, setStatHolidayCloseTime] = useState("00:00");
  const [updateSocialBio, setUpdateSocialBio] = useState(false);
  const [promoteSocial, setPromoteSocial] = useState(false);

  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  // Skip validation while both fields are still at the default 00:00 (untouched).
  // Treat a close time of 00:00 as midnight (24:00) so e.g. 08:00 -> 00:00 is valid.
  const isInvalidRange = (open: string, close: string) => {
    if (open === "00:00" && close === "00:00") return false;
    const closeMin = close === "00:00" ? 24 * 60 : toMinutes(close);
    return closeMin <= toMinutes(open);
  };

  const dayErrors: Record<string, boolean> = Object.fromEntries(
    DAYS.map(day => [
      day,
      schedule[day].open && isInvalidRange(schedule[day].openTime, schedule[day].closeTime),
    ])
  );
  const statHolidayError =
    statHolidayOpen && isInvalidRange(statHolidayOpenTime, statHolidayCloseTime);

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
    const socialBioInfo = updateSocialBio
      ? "Update Social Media Bio Hours: Yes"
      : "Update Social Media Bio Hours: No";
    const promoteInfo = promoteSocial
      ? "Promote New Hours on Social Media: Yes"
      : "Promote New Hours on Social Media: No";
    const fanout = (updateSocialBio || promoteSocial) ? "\nPromote on Social Media: Yes" : "";
    onChange(`${datePart}\n\nUpdated Business Hours:\n${lines.join("\n")}\n\n${statHolidayInfo}\n\n${socialBioInfo}\n${promoteInfo}${fanout}`);
  }, [schedule, startDate, endDate, statHolidayOpen, statHolidayOpenTime, statHolidayCloseTime, updateSocialBio, promoteSocial, onChange]);

  const update = (day: string, field: keyof DaySchedule, value: string | boolean) => {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const applyMondayToAll = () => {
    setSchedule(prev => {
      const monday = prev["Monday"];
      const next = { ...prev };
      DAYS.forEach(day => {
        if (day !== "Monday") next[day] = { ...monday };
      });
      return next;
    });
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
          <Popover
            open={startOpen}
            onOpenChange={(o) => {
              setStartOpen(o);
              if (o) setTempStartDate(startDate);
            }}
          >
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
                selected={tempStartDate}
                onSelect={setTempStartDate}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
              <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setStartOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!tempStartDate}
                  onClick={() => {
                    setStartDate(tempStartDate);
                    if (endDate && tempStartDate && endDate < tempStartDate) {
                      setEndDate(undefined);
                    }
                    setStartOpen(false);
                  }}
                >
                  Confirm
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">End Date</Label>
          <Popover
            open={endOpen}
            onOpenChange={(o) => {
              setEndOpen(o);
              if (o) setTempEndDate(endDate);
            }}
          >
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
                selected={tempEndDate}
                onSelect={setTempEndDate}
                disabled={(date) =>
                  date < (startDate || new Date(new Date().setHours(0, 0, 0, 0)))
                }
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setEndDate(undefined);
                    setTempEndDate(undefined);
                    setEndOpen(false);
                  }}
                >
                  Clear
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEndOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!tempEndDate}
                    onClick={() => {
                      setEndDate(tempEndDate);
                      setEndOpen(false);
                    }}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Schedule grid */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-medium">Business Hours</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={applyMondayToAll}
          >
            Apply Monday to all days
          </Button>
        </div>
        <div className="space-y-2">
          {DAYS.map(day => (
            <div key={day} className="space-y-1">
              <div className={cn(
                "flex flex-wrap items-center gap-2 p-2 rounded-xl bg-muted/30 min-w-0",
                dayErrors[day] && "ring-1 ring-destructive/60"
              )}>
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
                    <TimeSelect
                      value={schedule[day].openTime}
                      onChange={v => update(day, "openTime", v)}
                      invalid={dayErrors[day]}
                    />
                    <span className="text-muted-foreground text-xs shrink-0">to</span>
                    <TimeSelect
                      value={schedule[day].closeTime}
                      onChange={v => update(day, "closeTime", v)}
                      invalid={dayErrors[day]}
                    />
                  </div>
                )}
              </div>
              {dayErrors[day] && (
                <p className="text-xs text-destructive pl-2">Close time must be after open time.</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stat Holiday Hours */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Statutory Holiday Hours</Label>
        <div className={cn(
          "flex flex-wrap items-center gap-2 p-2 rounded-xl bg-muted/30 min-w-0",
          statHolidayError && "ring-1 ring-destructive/60"
        )}>
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
              <TimeSelect
                value={statHolidayOpenTime}
                onChange={setStatHolidayOpenTime}
                invalid={statHolidayError}
              />
              <span className="text-muted-foreground text-xs shrink-0">to</span>
              <TimeSelect
                value={statHolidayCloseTime}
                onChange={setStatHolidayCloseTime}
                invalid={statHolidayError}
              />
            </div>
          )}
        </div>
        {statHolidayError && (
          <p className="text-xs text-destructive pl-2">Close time must be after open time.</p>
        )}
      </div>

      {/* Social Media Bio sync */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
        <Checkbox
          id="update-social-bio"
          checked={updateSocialBio}
          onCheckedChange={(v) => setUpdateSocialBio(v === true)}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <Label htmlFor="update-social-bio" className="text-sm font-medium cursor-pointer">
            Change time in Social Media Bio
          </Label>
          <p className="text-xs text-muted-foreground">
            Also send this request to the Social Media team to update bio hours on connected profiles.
          </p>
        </div>
      </div>

      {/* Promote on Social Media */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border/40">
        <Checkbox
          id="promote-social"
          checked={promoteSocial}
          onCheckedChange={(v) => setPromoteSocial(v === true)}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <Label htmlFor="promote-social" className="text-sm font-medium cursor-pointer">
            Promote on Social Media
          </Label>
          <p className="text-xs text-muted-foreground">
            Also send this request to the Social Media team to create a promotional post announcing the updated hours.
          </p>
        </div>
      </div>
    </div>
  );
}
