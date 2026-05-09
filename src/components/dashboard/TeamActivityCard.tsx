import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ArrowUpRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  team_role: string | null;
  last_seen_at: string | null;
  is_online: boolean;
}

export default function TeamActivityCard() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await (supabase as any).rpc("get_team_activity_summary");
      if (cancelled) return;
      setRows((data as TeamRow[]) || []);
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 30_000);
    const ticker = setInterval(() => setTick(x => x + 1), 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(ticker);
    };
  }, []);

  const sorted = [...rows].sort((a, b) => {
    if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
    const at = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const bt = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return bt - at;
  });

  const onlineCount = rows.filter(r => r.is_online).length;

  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Users className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Team Activity</h3>
            <p className="text-[11px] text-muted-foreground">
              {onlineCount} online · {rows.length} team member{rows.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <Link
          to="/employees?tab=activity"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </header>
      <div className="max-h-[360px] overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading...</div>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No team members.</div>
        ) : (
          <ul className="space-y-0.5">
            {sorted.map(r => (
              <li
                key={r.user_id}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    r.is_online ? "bg-success animate-pulse" : "bg-muted-foreground/30"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.full_name || r.email || "—"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {r.role === "admin" ? "Admin" : (r.team_role || "Member")}
                  </p>
                </div>
                <div className="text-right">
                  {r.is_online ? (
                    <span className="text-[11px] font-semibold text-success">Online</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {r.last_seen_at
                        ? formatDistanceToNow(parseISO(r.last_seen_at), { addSuffix: true })
                        : "Never"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
