import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { Search, Activity, CheckCircle2, MessageSquare, Ticket, FileText, AlertTriangle, Calendar, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  team_role: string | null;
  first_login_at: string | null;
  last_seen_at: string | null;
  login_count: number;
  is_online: boolean;
  tickets_assigned: number;
  tickets_in_progress: number;
  tickets_completed: number;
  tickets_voided: number;
  comments_posted: number;
  chat_messages: number;
  posts_acted_on: number;
  calendars_created: number;
  last_activity_at: string | null;
}

interface TimelineEvent {
  event_at: string;
  event_type: string;
  description: string;
  ref_id: string | null;
  clinic_id: string | null;
  metadata: any;
}

const eventIcon = (type: string) => {
  if (type.startsWith("ticket_voided")) return { Icon: AlertTriangle, color: "text-destructive" };
  if (type === "ticket_assignment_completed") return { Icon: CheckCircle2, color: "text-success" };
  if (type === "ticket_assignment_void") return { Icon: AlertTriangle, color: "text-destructive" };
  if (type.startsWith("ticket_assignment_")) return { Icon: Ticket, color: "text-muted-foreground" };
  if (type.startsWith("ticket_created")) return { Icon: Ticket, color: "text-primary" };
  if (type.startsWith("ticket_status")) return { Icon: CheckCircle2, color: "text-success" };
  if (type.startsWith("ticket_")) return { Icon: Ticket, color: "text-muted-foreground" };
  if (type === "chat_message") return { Icon: MessageSquare, color: "text-[hsl(var(--dept-social))]" };
  if (type === "comment_posted") return { Icon: MessageSquare, color: "text-primary" };
  if (type === "calendar_created" || type === "sm2_generation_created") return { Icon: Calendar, color: "text-[hsl(var(--dept-seo))]" };
  if (type === "promotion_created") return { Icon: Send, color: "text-[hsl(var(--dept-social))]" };
  if (type === "blog_published") return { Icon: FileText, color: "text-[hsl(var(--dept-seo))]" };
  if (type.startsWith("gbp_post_")) return { Icon: FileText, color: "text-[hsl(var(--dept-seo))]" };
  if (type.startsWith("post_")) return { Icon: FileText, color: "text-[hsl(var(--dept-social))]" };
  return { Icon: Activity, color: "text-muted-foreground" };
};

export default function TeamActivityTab() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TeamRow | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [clinicMap, setClinicMap] = useState<Record<string, string>>({});
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const PAGE_SIZE = 50;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data }, clinicsRes] = await Promise.all([
        (supabase as any).rpc("get_team_activity_summary"),
        supabase.from("clinics").select("id, clinic_name"),
      ]);
      if (cancelled) return;
      setRows((data as TeamRow[]) || []);
      setClinicMap(Object.fromEntries((clinicsRes.data || []).map((c: any) => [c.id, c.clinic_name])));
      setLoading(false);
    };
    setLoading(true);
    load();

    // Auto-refresh every 30s so the online dot and counters stay live.
    const interval = setInterval(load, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);

    // Realtime: refresh immediately when activity-related tables change.
    const channel = supabase
      .channel('team-activity-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_login_activity' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_audit_log' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'department_tickets' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'department_ticket_assignments' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'department_chats' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_activity_log' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'content_posts' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'content_requests' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clinic_promotions' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sm2_generations' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gbp_post_history' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blog_posts' }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPage = useCallback(async (userId: string, offset: number) => {
    const { data } = await (supabase as any).rpc("get_team_member_timeline", {
      _user_id: userId,
      _limit: PAGE_SIZE,
      _offset: offset,
    });
    return (data as TimelineEvent[]) || [];
  }, []);

  const openMember = async (row: TeamRow) => {
    setSelected(row);
    setTimeline([]);
    setHasMore(true);
    setTimelineLoading(true);
    const page = await fetchPage(row.user_id, 0);
    setTimeline(page);
    setHasMore(page.length === PAGE_SIZE);
    setTimelineLoading(false);
  };

  const loadMore = useCallback(async () => {
    if (!selected || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const page = await fetchPage(selected.user_id, timeline.length);
    setTimeline(prev => [...prev, ...page]);
    setHasMore(page.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [selected, loadingMore, hasMore, timeline.length, fetchPage]);

  useEffect(() => {
    if (!sentinelRef.current || !selected || timelineLoading) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, selected, timelineLoading, timeline.length]);

  const filtered = rows.filter(r => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (r.full_name || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q) || (r.team_role || "").toLowerCase().includes(q);
  });

  return (
    <>
      <div className="space-y-4">
        <Card className="border-border/60">
          <CardContent className="py-3 px-3 sm:px-4">
            <div className="relative max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team members..." className="pl-8 h-9" />
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading activity...
            </div>
          </CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No team members found.</CardContent></Card>
        ) : (
          <Card className="overflow-hidden border-border/60">
            <Table className="data-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-center">Logins</TableHead>
                  <TableHead className="text-center">Tickets done</TableHead>
                  <TableHead className="text-center">In progress</TableHead>
                  <TableHead className="text-center">Comments</TableHead>
                  <TableHead className="text-center">Chat</TableHead>
                  <TableHead className="text-center">Posts</TableHead>
                  <TableHead className="text-center">Calendars</TableHead>
                  <TableHead className="text-right">Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.user_id} className="cursor-pointer" onClick={() => openMember(r)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", r.is_online ? "bg-success animate-pulse" : "bg-muted-foreground/30")} />
                        <div className="min-w-0">
                          <div className="truncate">{r.full_name || "—"}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{r.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.role === "admin" ? "default" : "secondary"} className="text-[11px]">
                        {r.role === "admin" ? "Admin" : (r.team_role || "Member")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.is_online ? (
                        <Badge className="bg-success/15 text-success border-success/30 text-[11px]">Online</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Offline</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.last_seen_at ? formatDistanceToNow(parseISO(r.last_seen_at), { addSuffix: true }) : "Never"}
                    </TableCell>
                    <TableCell className="text-center text-sm">{r.login_count}</TableCell>
                    <TableCell className="text-center text-sm font-medium text-success">{r.tickets_completed}</TableCell>
                    <TableCell className="text-center text-sm">{r.tickets_in_progress}</TableCell>
                    <TableCell className="text-center text-sm">{r.comments_posted}</TableCell>
                    <TableCell className="text-center text-sm">{r.chat_messages}</TableCell>
                    <TableCell className="text-center text-sm">{r.posts_acted_on}</TableCell>
                    <TableCell className="text-center text-sm">{r.calendars_created}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-8 text-xs">View timeline</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", selected?.is_online ? "bg-success animate-pulse" : "bg-muted-foreground/30")} />
              {selected?.full_name || "Team member"}
            </SheetTitle>
            <SheetDescription>
              {selected?.email} • {selected?.role === "admin" ? "Admin" : (selected?.team_role || "Member")}
              {selected?.last_seen_at && (
                <> • Last seen {formatDistanceToNow(parseISO(selected.last_seen_at), { addSuffix: true })}</>
              )}
            </SheetDescription>
          </SheetHeader>

          {selected && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
              <Stat label="Logins" value={selected.login_count} />
              <Stat label="Completed" value={selected.tickets_completed} accent="text-success" />
              <Stat label="In progress" value={selected.tickets_in_progress} />
              <Stat label="Voided" value={selected.tickets_voided} accent="text-destructive" />
              <Stat label="Comments" value={selected.comments_posted} />
              <Stat label="Chat msgs" value={selected.chat_messages} />
              <Stat label="Post actions" value={selected.posts_acted_on} />
              <Stat label="Calendars" value={selected.calendars_created} />
            </div>
          )}

          <div className="mt-6">
            <h4 className="text-sm font-bold text-foreground mb-3">Recent activity</h4>
            {timelineLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading timeline...</div>
            ) : timeline.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No tracked activity yet.</div>
            ) : (
              <div className="relative">
                <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border/60" />
                <ul className="space-y-3">
                  {timeline.map((ev, i) => {
                    const { Icon, color } = eventIcon(ev.event_type);
                    const clinicName = ev.clinic_id ? clinicMap[ev.clinic_id] : null;
                    return (
                      <li key={i} className="relative flex items-start gap-3 pl-0">
                        <div className="relative z-10 mt-0.5 h-8 w-8 rounded-full bg-card border-2 border-border flex items-center justify-center shrink-0">
                          <Icon className={cn("h-3.5 w-3.5", color)} />
                        </div>
                        <div className="min-w-0 flex-1 pt-1">
                          <p className="text-sm text-foreground leading-snug break-words">{ev.description}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {format(parseISO(ev.event_at), "MMM d, yyyy 'at' h:mm a")}
                            {clinicName && <> • {clinicName}</>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div ref={sentinelRef} className="h-4" />
                {loadingMore && (
                  <div className="py-3 text-center text-xs text-muted-foreground">Loading more...</div>
                )}
                {!hasMore && timeline.length > 0 && (
                  <div className="py-3 text-center text-[11px] text-muted-foreground">End of activity ({timeline.length} events)</div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-2.5">
      <div className={cn("text-lg font-bold", accent || "text-foreground")}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
