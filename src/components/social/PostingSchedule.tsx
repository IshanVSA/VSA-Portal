import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Calendar, Globe } from "lucide-react";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";

interface Props {
  clinicId: string | undefined;
}

const TIMEZONES = [
  { value: "America/Vancouver", label: "Pacific (PT)" },
  { value: "America/Edmonton", label: "Mountain (MT)" },
  { value: "America/Winnipeg", label: "Central (CT)" },
  { value: "America/Toronto", label: "Eastern (ET)" },
  { value: "America/Halifax", label: "Atlantic (AT)" },
  { value: "America/St_Johns", label: "Newfoundland (NT)" },
  { value: "Asia/Kolkata", label: "IST (India)" },
];

// IST posting windows — staggered per day of week
const IST_SCHEDULE: Record<number, { time: string; label: string }> = {
  1: { time: "09:30", label: "Mon 9:30 AM IST" },
  2: { time: "10:00", label: "Tue 10:00 AM IST" },
  3: { time: "09:00", label: "Wed 9:00 AM IST" },
  4: { time: "10:30", label: "Thu 10:30 AM IST" },
  5: { time: "09:30", label: "Fri 9:30 AM IST" },
  6: { time: "11:00", label: "Sat 11:00 AM IST" },
  0: { time: "10:00", label: "Sun 10:00 AM IST" },
};

export default function PostingSchedule({ clinicId }: Props) {
  const [selectedTZ, setSelectedTZ] = useState("America/Toronto");

  const { data: clinic } = useQuery({
    queryKey: ["clinic-tz", clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data } = await supabase.from("clinics").select("timezone").eq("id", clinicId).maybeSingle();
      return data;
    },
    enabled: !!clinicId,
  });

  // Use clinic timezone if available
  const tz = clinic?.timezone || selectedTZ;

  // Build current month schedule
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // 3 posts/week: Mon, Wed, Fri
  const postingDays = days.filter((d) => [1, 3, 5].includes(getDay(d)));

  const schedule = useMemo(() => {
    return postingDays.map((day) => {
      const dow = getDay(day);
      const istSlot = IST_SCHEDULE[dow];
      // Convert IST to clinic local (approximation display)
      const istOffset = 5.5; // IST is UTC+5:30
      const [h, m] = istSlot.time.split(":").map(Number);
      return {
        date: day,
        istTime: istSlot.time,
        label: format(day, "EEE, MMM d"),
        postWindow: `${istSlot.time} IST`,
      };
    });
  }, [postingDays]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Posting Schedule - {format(now, "MMMM yyyy")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={tz} onValueChange={setSelectedTZ}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Posts are scheduled Mon/Wed/Fri with staggered IST posting times.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {schedule.map((slot, i) => {
            const isPast = slot.date < now;
            return (
              <div
                key={i}
                className={`rounded-xl border p-2.5 flex items-center justify-between ${
                  isPast ? "opacity-50 bg-muted/30" : "bg-card"
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{slot.label}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {slot.postWindow}
                  </p>
                </div>
                <Badge variant={isPast ? "secondary" : "outline"} className="text-[10px]">
                  {isPast ? "Posted" : `Post #${i + 1}`}
                </Badge>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            {schedule.length} posts scheduled this month · 3 per week · Auto-staggered to avoid cluster overlap
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
