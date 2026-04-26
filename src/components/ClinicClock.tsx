import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ClinicClockProps {
  clinicId: string;
}

export function ClinicClock({ clinicId }: ClinicClockProps) {
  const [timezone, setTimezone] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    if (!clinicId) {
      setTimezone(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase
        .from("clinics" as any)
        .select("timezone") as any)
        .eq("id", clinicId)
        .maybeSingle();
      if (!cancelled && !error && data) {
        setTimezone((data as any).timezone || null);
      }
    })();
    return () => { cancelled = true; };
  }, [clinicId]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!timezone) return null;

  let timeStr = "";
  let tzAbbr = "";
  try {
    timeStr = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(now);
    tzAbbr = parts.find(p => p.type === "timeZoneName")?.value || "";
  } catch {
    return null;
  }

  const cityLabel = timezone.split("/").pop()?.replace(/_/g, " ") || "";

  return (
    <div
      className="hidden sm:flex items-center gap-1.5 px-2 sm:px-2.5 h-8 rounded-md bg-muted/40 border border-border/40 text-[11px] font-medium text-foreground shrink-0"
      title={`Clinic local time (${timezone})`}
    >
      <Clock className="h-3 w-3 text-muted-foreground" />
      <span className="tabular-nums">{timeStr}</span>
      <span className="text-muted-foreground hidden md:inline">{tzAbbr || cityLabel}</span>
    </div>
  );
}
