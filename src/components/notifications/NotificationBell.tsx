import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, FileText, MessageSquare, AlertTriangle, CheckCircle, Ticket, Sparkles, Send, ThumbsUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: "post_approved" | "post_flagged" | "comment_added" | "status_changed" | "ticket_created" | "sm2_generated" | "sm2_sent" | "sm2_approved" | "sm2_feedback";
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

const typeConfig = {
  post_approved: { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  post_flagged: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10" },
  comment_added: { icon: MessageSquare, color: "text-primary", bg: "bg-primary/10" },
  status_changed: { icon: FileText, color: "text-muted-foreground", bg: "bg-muted" },
  ticket_created: { icon: Ticket, color: "text-amber-500", bg: "bg-amber-500/10" },
  sm2_generated: { icon: Sparkles, color: "text-violet-500", bg: "bg-violet-500/10" },
  sm2_sent: { icon: Send, color: "text-blue-500", bg: "bg-blue-500/10" },
  sm2_approved: { icon: ThumbsUp, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  sm2_feedback: { icon: MessageSquare, color: "text-orange-500", bg: "bg-orange-500/10" },
};

function mapSM2Status(status: string): Notification["type"] {
  if (status === "sent_to_client") return "sm2_sent";
  if (status === "approved_client" || status === "approved_auto") return "sm2_approved";
  if (status === "feedback_submitted") return "sm2_feedback";
  return "sm2_generated";
}

function sm2Title(status: string): string {
  if (status === "sent_to_client") return "Content Sent to Client";
  if (status === "approved_client") return "Client Approved Content";
  if (status === "approved_auto") return "Content Auto-Approved";
  if (status === "feedback_submitted") return "Client Submitted Feedback";
  return "Content Generated";
}

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const storageKey = user ? `notif-read-ids:${user.id}` : null;
  const readIdsRef = useRef<Set<string>>(new Set());

  const loadReadIds = (): Set<string> => {
    if (!storageKey) return new Set();
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    } catch { return new Set(); }
  };

  const persistReadIds = (ids: Set<string>) => {
    if (!storageKey) return;
    // Cap at 500 most recent IDs to avoid unbounded growth
    const arr = Array.from(ids).slice(-500);
    try { localStorage.setItem(storageKey, JSON.stringify(arr)); } catch {}
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!user) return;

    readIdsRef.current = loadReadIds();

    const withRead = (n: Notification): Notification => ({ ...n, read: readIdsRef.current.has(n.id) });

    const fetchNotifications = async () => {
      const { data: activityData } = await supabase
        .from("post_activity_log")
        .select("id, action, metadata, created_at, post_id")
        .order("created_at", { ascending: false })
        .limit(15);

      const activityNotifs: Notification[] = (activityData || []).map((log: any) => {
        const meta = typeof log.metadata === "object" ? log.metadata : {};
        let type: Notification["type"] = "status_changed";
        if (log.action.includes("approved")) type = "post_approved";
        else if (log.action.includes("flag")) type = "post_flagged";
        else if (log.action.includes("comment")) type = "comment_added";
        return {
          id: log.id, type,
          title: log.action.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
          message: meta.message || `Post activity: ${log.action}`,
          read: false, created_at: log.created_at,
        };
      });

      const { data: ticketData } = await supabase
        .from("department_tickets")
        .select("id, title, department, priority, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      const ticketNotifs: Notification[] = (ticketData || []).map((t: any) => ({
        id: `ticket-${t.id}`, type: "ticket_created" as const,
        title: "New Ticket",
        message: `[${t.department}] ${t.title}${t.priority !== "regular" ? ` (${t.priority})` : ""}`,
        read: false, created_at: t.created_at,
      }));

      // SM2 generation notifications
      const { data: sm2Data } = await supabase
        .from("sm2_generations")
        .select("id, month_year, approval_status, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(10);

      const sm2Notifs: Notification[] = (sm2Data || []).map((g: any) => ({
        id: `sm2-${g.id}`,
        type: mapSM2Status(g.approval_status),
        title: sm2Title(g.approval_status),
        message: `Social media content for ${g.month_year}`,
        read: false,
        created_at: g.updated_at || g.created_at,
      }));

      const all = [...activityNotifs, ...ticketNotifs, ...sm2Notifs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 30)
        .map(withRead);

      setNotifications(all);
    };

    fetchNotifications();

    const channel = supabase
      .channel("notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_activity_log" }, (payload) => {
        const log = payload.new as any;
        const meta = typeof log.metadata === "object" ? log.metadata : {};
        let type: Notification["type"] = "status_changed";
        if (log.action.includes("approved")) type = "post_approved";
        else if (log.action.includes("flag")) type = "post_flagged";
        else if (log.action.includes("comment")) type = "comment_added";
        const newNotif: Notification = {
          id: log.id, type,
          title: log.action.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
          message: meta.message || `Post activity: ${log.action}`,
          read: false, created_at: log.created_at,
        };
        setNotifications(prev => [withRead(newNotif), ...prev].slice(0, 30));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "department_tickets" }, (payload) => {
        const t = payload.new as any;
        const newNotif: Notification = {
          id: `ticket-${t.id}`, type: "ticket_created",
          title: "New Ticket",
          message: `[${t.department}] ${t.title}${t.priority !== "regular" ? ` (${t.priority})` : ""}`,
          read: false, created_at: t.created_at,
        };
        setNotifications(prev => [withRead(newNotif), ...prev].slice(0, 30));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "department_tickets" }, (payload) => {
        const t = payload.new as any;
        const newNotif: Notification = {
          id: `ticket-upd-${t.id}-${Date.now()}`, type: "status_changed",
          title: `Ticket ${t.status.replace(/_/g, " ")}`,
          message: `[${t.department}] ${t.title}`,
          read: false, created_at: t.updated_at || new Date().toISOString(),
        };
        setNotifications(prev => [withRead(newNotif), ...prev].slice(0, 30));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sm2_generations" }, (payload) => {
        const g = payload.new as any;
        if (!g) return;
        const newNotif: Notification = {
          id: `sm2-${g.id}-${Date.now()}`,
          type: mapSM2Status(g.approval_status),
          title: sm2Title(g.approval_status),
          message: `Social media content for ${g.month_year}`,
          read: false,
          created_at: g.updated_at || g.created_at || new Date().toISOString(),
        };
        setNotifications(prev => [withRead(newNotif), ...prev].slice(0, 30));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);


  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <div className="relative">
      <button ref={buttonRef} className="relative p-2 rounded-lg hover:bg-muted transition-colors" onClick={() => setOpen(!open)}>
        <Bell className="h-[18px] w-[18px] text-muted-foreground" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              style={{ position: "fixed", top: pos.top, right: pos.right }}
              className="w-80 sm:w-96 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-[100]">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Check className="h-3 w-3" /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-[380px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((notif, i) => {
                    const config = typeConfig[notif.type];
                    const Icon = config.icon;
                    return (
                      <motion.div key={notif.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                        className={cn("flex items-start gap-3 px-4 py-3 border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer", !notif.read && "bg-primary/[0.03]")}
                        onClick={() => setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))}>
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", config.bg)}>
                          <Icon className={cn("h-4 w-4", config.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{notif.title}</p>
                            {!notif.read && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{notif.message}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
