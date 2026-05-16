import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell, Check, FileText, MessageSquare, AlertTriangle, CheckCircle, Ticket, Sparkles, Send, ThumbsUp, Inbox, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserDepartments, type DepartmentType } from "@/hooks/useUserDepartments";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";

interface Notification {
  id: string;
  type: "post_approved" | "post_flagged" | "comment_added" | "status_changed" | "ticket_created" | "sm2_generated" | "sm2_sent" | "sm2_approved" | "sm2_feedback" | "client_note";
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  link?: string;
  clinicId?: string | null;
  clinicName?: string | null;
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
  client_note: { icon: MessageSquare, color: "text-orange-500", bg: "bg-orange-500/10" },
};

function mapSM2Status(status: string): Notification["type"] {
  if (status === "sent_to_client") return "sm2_sent";
  if (status === "approved_client" || status === "approved_auto") return "sm2_approved";
  if (status === "feedback_submitted") return "sm2_feedback";
  return "sm2_generated";
}

function sm2Title(status: string, isClient = false): string {
  if (status === "sent_to_client") return isClient ? "Content Ready for Your Review" : "Content Sent to Client";
  if (status === "approved_client") return "Client Approved Content";
  if (status === "approved_auto") return "Content Auto-Approved";
  if (status === "final_approved") return isClient ? "Final Content with Images Ready" : "Content Finalized";
  if (status === "feedback_submitted") return "Client Submitted Feedback";
  return "Content Generated";
}

function sm2Message(status: string, monthYear: string, isClient: boolean): string {
  if (isClient) {
    if (status === "sent_to_client") return `Your ${monthYear} social calendar is ready for review.`;
    if (status === "final_approved") return `Your ${monthYear} content is finalized with images and ready to publish.`;
    if (status === "approved_client" || status === "approved_auto") return `Your ${monthYear} content has been approved.`;
  }
  return `Social media content for ${monthYear}`;
}

// Statuses surfaced to clients in their notification bell
const CLIENT_VISIBLE_SM2_STATUSES = new Set([
  "sent_to_client",
  "approved_client",
  "approved_auto",
  "final_approved",
]);

const TICKET_STATUS_LABELS_FOR_CLIENT: Record<string, string> = {
  in_progress: "Ticket In Progress",
  completed: "Ticket Resolved",
  resolved: "Ticket Resolved",
  closed: "Ticket Closed",
};

const DEPARTMENT_ROUTE: Record<string, string> = {
  website: "/website",
  seo: "/seo",
  google_ads: "/google-ads",
  social_media: "/social",
  ai_seo: "/ai-seo",
};

function buildTicketLink(
  department: string | null | undefined,
  clinicId: string | null | undefined,
  ticketId: string,
  allowedDepartments?: DepartmentType[] | null,
  createdAt?: string | null,
): string {
  let dept = department || "";
  // If the user is dept-scoped and the ticket's home department isn't theirs
  // (cross-posted ticket), route to the user's first allowed department so the
  // page is actually accessible.
  if (allowedDepartments && allowedDepartments.length > 0 && !allowedDepartments.includes(dept as DepartmentType)) {
    dept = allowedDepartments[0];
  }
  const base = DEPARTMENT_ROUTE[dept] || "/social";
  const params = new URLSearchParams({ tab: "tickets", ticket: ticketId });
  if (clinicId) params.set("clinic", clinicId);
  if (createdAt) {
    const d = new Date(createdAt);
    if (!isNaN(d.getTime())) {
      params.set("month", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }
  return `${base}?${params.toString()}`;
}

function buildSM2Link(clinicId: string | null | undefined, role: string | null, status: string): string {
  const params = new URLSearchParams();
  if (clinicId) params.set("clinic", clinicId);
  // Admin reviews live on /review; clients see their content under My Posts
  if (role === "admin" && (status === "feedback_submitted" || status === "sent_to_client")) {
    return `/review${params.toString() ? `?${params.toString()}` : ""}`;
  }
  if (role === "client") {
    params.set("tab", "my-posts");
  } else {
    params.set("tab", "overview");
  }
  return `/social?${params.toString()}`;
}

function buildPostLink(clinicId: string | null | undefined, postId: string, role: string | null): string {
  const params = new URLSearchParams();
  if (clinicId) params.set("clinic", clinicId);
  params.set("tab", role === "client" ? "my-posts" : "overview");
  params.set("post", postId);
  return `/social?${params.toString()}`;
}

function buildSM2PostLink(clinicId: string | null | undefined, scheduledDate: string | null): string {
  const params = new URLSearchParams();
  if (clinicId) params.set("clinic", clinicId);
  params.set("tab", "generation");
  if (scheduledDate) params.set("sm2date", scheduledDate);
  return `/social?${params.toString()}`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const { role } = useUserRole();
  const { departments, isAllAccess } = useUserDepartments();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const clinicNameMapRef = useRef<Map<string, string>>(new Map());

  const storageKey = user ? `notif-read-ids:${user.id}` : null;
  const readAllKey = user ? `notif-read-all-at:${user.id}` : null;
  const readIdsRef = useRef<Set<string>>(new Set());
  const readAllAtRef = useRef<number>(0);

  const getClinicName = async (clinicId: string | null | undefined): Promise<string | null> => {
    if (!clinicId) return null;
    const cached = clinicNameMapRef.current.get(clinicId);
    if (cached) return cached;
    const { data } = await supabase.from("clinics").select("clinic_name").eq("id", clinicId).maybeSingle();
    const name = (data as any)?.clinic_name || null;
    if (name) clinicNameMapRef.current.set(clinicId, name);
    return name;
  };

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
    if (readAllKey) {
      const raw = localStorage.getItem(readAllKey);
      readAllAtRef.current = raw ? Number(raw) || 0 : 0;
    }

    const isReadById = (n: Notification) =>
      readIdsRef.current.has(n.id) ||
      (readAllAtRef.current > 0 && new Date(n.created_at).getTime() <= readAllAtRef.current);

    const withRead = (n: Notification): Notification => ({ ...n, read: isReadById(n) });

    const fetchNotifications = async () => {
      const { data: activityData } = await supabase
        .from("post_activity_log")
        .select("id, action, metadata, created_at, post_id, content_posts!post_activity_log_post_id_fkey(clinic_id)")
        .order("created_at", { ascending: false })
        .limit(15);

      const activityNotifs: Notification[] = (activityData || []).map((log: any) => {
        const meta = typeof log.metadata === "object" ? log.metadata : {};
        let type: Notification["type"] = "status_changed";
        if (log.action.includes("approved")) type = "post_approved";
        else if (log.action.includes("flag")) type = "post_flagged";
        else if (log.action.includes("comment")) type = "comment_added";
        const clinicId = log.content_posts?.clinic_id ?? null;
        return {
          id: log.id, type,
          title: log.action.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
          message: meta.message || `Post activity: ${log.action}`,
          read: false, created_at: log.created_at,
          link: log.post_id ? buildPostLink(clinicId, log.post_id, role) : undefined,
          clinicId,
        };
      });

      const isClient = role === "client";
      const staffScoped = !isAllAccess && departments !== null;
      const deptSet = new Set<DepartmentType>(departments ?? []);

      // For staff, notifications are "New Ticket" events keyed off created_at,
      // so order by created_at to avoid old tickets (recently edited) pushing
      // newer ones out of the cap. Bump cap to give some headroom.
      const { data: ticketData } = await supabase
        .from("department_tickets")
        .select("id, title, department, priority, status, created_at, updated_at, clinic_id")
        .order(isClient ? "updated_at" : "created_at", { ascending: false })
        .limit(50);

      // For staff scoped to specific departments, also surface tickets that
      // were fanned out to one of their departments (e.g. Website ticket with
      // "Promote on Social Media: Yes" → social_media).
      let fanOutTicketIds = new Set<string>();
      if (staffScoped && deptSet.size > 0 && (ticketData || []).length > 0) {
        const ticketIds = (ticketData || []).map((t: any) => t.id);
        const { data: faRows } = await supabase
          .from("department_ticket_assignments")
          .select("ticket_id")
          .in("ticket_id", ticketIds)
          .in("department", Array.from(deptSet));
        fanOutTicketIds = new Set((faRows || []).map((r: any) => r.ticket_id));
      }

      const ticketVisible = (t: any) => {
        if (!staffScoped) return true;
        if (t.department && deptSet.has(t.department as DepartmentType)) return true;
        return fanOutTicketIds.has(t.id);
      };

      const ticketNotifs: Notification[] = (ticketData || []).flatMap((t: any): Notification[] => {
        if (!ticketVisible(t)) return [];
        // Clients: only surface meaningful status changes (work done on their tickets),
        // not raw "ticket created" events.
        if (isClient) {
          const label = TICKET_STATUS_LABELS_FOR_CLIENT[t.status];
          if (!label) return [];
          return [{
            id: `ticket-status-${t.id}-${t.status}`,
            type: "status_changed" as const,
            title: label,
            message: `[${t.department}] ${t.title}`,
            read: false,
            created_at: t.updated_at || t.created_at,
            link: buildTicketLink(t.department, t.clinic_id, t.id, isAllAccess ? null : departments, t.created_at),
            clinicId: t.clinic_id ?? null,
          }];
        }
        return [{
          id: `ticket-${t.id}`,
          type: "ticket_created" as const,
          title: "New Ticket",
          message: `[${t.department}] ${t.title}${t.priority !== "regular" ? ` (${t.priority})` : ""}`,
          read: false,
          created_at: t.created_at,
          link: buildTicketLink(t.department, t.clinic_id, t.id, isAllAccess ? null : departments, t.created_at),
          clinicId: t.clinic_id ?? null,
        }];
      });

      // SM2 + post_activity_log notifications are inherently social_media domain.
      const socialAllowed = !staffScoped || deptSet.has("social_media");

      // SM2 generation notifications
      let sm2Data: any[] = [];
      if (socialAllowed) {
        const res = await supabase
          .from("sm2_generations")
          .select("id, month_year, approval_status, created_at, updated_at, clinic_id")
          .order("updated_at", { ascending: false })
          .limit(10);
        sm2Data = res.data || [];
      }

      const sm2Notifs: Notification[] = sm2Data
        // Clients only see "ready for review" and "approved/finalized" milestones
        .filter((g: any) => !isClient || CLIENT_VISIBLE_SM2_STATUSES.has(g.approval_status))
        .map((g: any) => ({
          id: `sm2-${g.id}-${g.approval_status}`,
          type: mapSM2Status(g.approval_status),
          title: sm2Title(g.approval_status, isClient),
          message: sm2Message(g.approval_status, g.month_year, isClient),
          read: false,
          created_at: g.updated_at || g.created_at,
          link: buildSM2Link(g.clinic_id, role, g.approval_status),
          clinicId: g.clinic_id ?? null,
        }));

      // Client notes on SM2 posts (staff-only relevant)
      let noteNotifs: Notification[] = [];
      if (role !== "client" && socialAllowed) {
        const { data: noteData } = await supabase
          .from("sm2_posts")
          .select("id, post_number, scheduled_date, client_feedback, updated_at, clinic_id")
          .not("client_feedback", "is", null)
          .neq("client_feedback", "")
          .order("updated_at", { ascending: false })
          .limit(10);
        noteNotifs = (noteData || []).map((p: any) => {
          const fb = (p.client_feedback || "").trim();
          const datePart = p.scheduled_date
            ? new Date(p.scheduled_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : "";
          const numPart = p.post_number != null ? `Post #${p.post_number}` : "Post";
          const preview = fb.length > 80 ? fb.slice(0, 80) + "…" : fb;
          return {
            id: `sm2-note-${p.id}`,
            type: "client_note" as const,
            title: "New Client Notes",
            message: `${numPart}${datePart ? ` (${datePart})` : ""}: ${preview}`,
            read: false,
            created_at: p.updated_at || new Date().toISOString(),
            link: buildSM2PostLink(p.clinic_id, p.scheduled_date),
            clinicId: p.clinic_id ?? null,
          };
        });
      }

      // post_activity_log is also social-media domain; drop for non-social staff.
      const scopedActivityNotifs = socialAllowed ? activityNotifs : [];

      const all = [...scopedActivityNotifs, ...ticketNotifs, ...sm2Notifs, ...noteNotifs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 30)
        .map(withRead);

      // Bulk-resolve clinic names for all notifications
      const uniqueClinicIds = Array.from(new Set(all.map(n => n.clinicId).filter(Boolean) as string[]));
      const missingIds = uniqueClinicIds.filter(id => !clinicNameMapRef.current.has(id));
      if (missingIds.length > 0) {
        const { data: clinicsData } = await supabase
          .from("clinics")
          .select("id, clinic_name")
          .in("id", missingIds);
        (clinicsData || []).forEach((c: any) => {
          if (c?.id && c?.clinic_name) clinicNameMapRef.current.set(c.id, c.clinic_name);
        });
      }
      const allWithNames = all.map(n => ({
        ...n,
        clinicName: n.clinicId ? clinicNameMapRef.current.get(n.clinicId) || null : null,
      }));

      setNotifications(allWithNames);
    };

    fetchNotifications();

    const enrichAndPush = async (notif: Notification) => {
      const clinicName = await getClinicName(notif.clinicId);
      setNotifications(prev => {
        const enriched = withRead({ ...notif, clinicName });
        const filtered = prev.filter(n => n.id !== enriched.id);
        return [enriched, ...filtered].slice(0, 30);
      });
    };

    const rtStaffScoped = !isAllAccess && departments !== null;
    const rtDeptSet = new Set<DepartmentType>(departments ?? []);
    const rtSocialAllowed = !rtStaffScoped || rtDeptSet.has("social_media");
    const isTicketVisibleForStaff = async (t: any): Promise<boolean> => {
      if (!rtStaffScoped) return true;
      if (t.department && rtDeptSet.has(t.department as DepartmentType)) return true;
      const { data } = await supabase
        .from("department_ticket_assignments")
        .select("ticket_id")
        .eq("ticket_id", t.id)
        .in("department", Array.from(rtDeptSet))
        .limit(1);
      return (data || []).length > 0;
    };

    const channel = supabase
      .channel(`user:${user.id}:notifications`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "post_activity_log" }, async (payload) => {
        if (!rtSocialAllowed) return;
        const log = payload.new as any;
        const meta = typeof log.metadata === "object" ? log.metadata : {};
        let type: Notification["type"] = "status_changed";
        if (log.action.includes("approved")) type = "post_approved";
        else if (log.action.includes("flag")) type = "post_flagged";
        else if (log.action.includes("comment")) type = "comment_added";
        let clinicId: string | null = null;
        if (log.post_id) {
          const { data: post } = await supabase.from("content_posts").select("clinic_id").eq("id", log.post_id).maybeSingle();
          clinicId = post?.clinic_id ?? null;
        }
        await enrichAndPush({
          id: log.id, type,
          title: log.action.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
          message: meta.message || `Post activity: ${log.action}`,
          read: false, created_at: log.created_at,
          link: log.post_id ? buildPostLink(clinicId, log.post_id, role) : undefined,
          clinicId,
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "department_tickets" }, async (payload) => {
        // Clients should not see "ticket created" — they already know they made it.
        if (role === "client") return;
        const t = payload.new as any;
        if (!(await isTicketVisibleForStaff(t))) return;
        await enrichAndPush({
          id: `ticket-${t.id}`, type: "ticket_created",
          title: "New Ticket",
          message: `[${t.department}] ${t.title}${t.priority !== "regular" ? ` (${t.priority})` : ""}`,
          read: false, created_at: t.created_at,
          link: buildTicketLink(t.department, t.clinic_id, t.id, isAllAccess ? null : departments, t.created_at),
          clinicId: t.clinic_id ?? null,
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "department_tickets" }, async (payload) => {
        const t = payload.new as any;
        const oldT = payload.old as any;
        // Only notify when the status actually changed — other field edits
        // (description, assignee, etc.) shouldn't resurrect the bell.
        if (!oldT || oldT.status === t.status) return;
        if (role !== "client" && !(await isTicketVisibleForStaff(t))) return;
        const isClient = role === "client";
        // Clients only get notified about meaningful resolution / progress updates.
        const clientLabel = TICKET_STATUS_LABELS_FOR_CLIENT[t.status];
        if (isClient && !clientLabel) return;
        const title = isClient
          ? clientLabel
          : `Ticket ${String(t.status).replace(/_/g, " ")}`;
        await enrichAndPush({
          id: `ticket-status-${t.id}-${t.status}`,
          type: "status_changed",
          title,
          message: `[${t.department}] ${t.title}`,
          read: false, created_at: t.updated_at || new Date().toISOString(),
          link: buildTicketLink(t.department, t.clinic_id, t.id, isAllAccess ? null : departments, t.created_at),
          clinicId: t.clinic_id ?? null,
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sm2_generations" }, async (payload) => {
        if (!rtSocialAllowed) return;
        const g = payload.new as any;
        const oldG = payload.old as any;
        if (!g) return;
        // For UPDATEs, only notify on approval_status transitions — other
        // field edits should not flip the bell back to unread.
        if (payload.eventType === "UPDATE" && oldG && oldG.approval_status === g.approval_status) return;
        const isClient = role === "client";
        // Clients only see "ready for review" and approval/finalization milestones.
        if (isClient && !CLIENT_VISIBLE_SM2_STATUSES.has(g.approval_status)) return;
        await enrichAndPush({
          id: `sm2-${g.id}-${g.approval_status}`,
          type: mapSM2Status(g.approval_status),
          title: sm2Title(g.approval_status, isClient),
          message: sm2Message(g.approval_status, g.month_year, isClient),
          read: false,
          created_at: g.updated_at || g.created_at || new Date().toISOString(),
          link: buildSM2Link(g.clinic_id, role, g.approval_status),
          clinicId: g.clinic_id ?? null,
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sm2_posts" }, async (payload) => {
        // Only staff (admin/concierge) get client-note notifications
        if (role === "client") return;
        if (!rtSocialAllowed) return;
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        const newFb = (newRow?.client_feedback || "").trim();
        const oldFb = (oldRow?.client_feedback || "").trim();
        // Notify only when client_feedback changed to a new non-empty value
        if (!newFb || newFb === oldFb) return;
        const datePart = newRow.scheduled_date
          ? new Date(newRow.scheduled_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : "";
        const numPart = newRow.post_number != null ? `Post #${newRow.post_number}` : "Post";
        const preview = newFb.length > 80 ? newFb.slice(0, 80) + "…" : newFb;
        await enrichAndPush({
          id: `sm2-note-${newRow.id}`,
          type: "client_note",
          title: "New Client Notes",
          message: `${numPart}${datePart ? ` (${datePart})` : ""}: ${preview}`,
          read: false,
          created_at: newRow.updated_at || new Date().toISOString(),
          link: buildSM2PostLink(newRow.clinic_id, newRow.scheduled_date),
          clinicId: newRow.clinic_id ?? null,
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, role, isAllAccess, departments?.join(",")]);

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
    const now = Date.now();
    readAllAtRef.current = now;
    if (readAllKey) {
      try { localStorage.setItem(readAllKey, String(now)); } catch {}
    }
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      next.forEach(n => readIdsRef.current.add(n.id));
      persistReadIds(readIdsRef.current);
      return next;
    });
  };

  const markOneRead = (id: string) => {
    setNotifications(prev => {
      const next = prev.map(n => n.id === id ? { ...n, read: true } : n);
      readIdsRef.current.add(id);
      persistReadIds(readIdsRef.current);
      return next;
    });
  };

  const [tab, setTab] = useState<"all" | "unread">("all");

  const visibleNotifications = useMemo(
    () => (tab === "unread" ? notifications.filter(n => !n.read) : notifications),
    [tab, notifications]
  );

  const grouped = useMemo(() => {
    const groups: { label: string; items: Notification[] }[] = [
      { label: "Today", items: [] },
      { label: "Yesterday", items: [] },
      { label: "This week", items: [] },
      { label: "Earlier", items: [] },
    ];
    visibleNotifications.forEach(n => {
      const d = new Date(n.created_at);
      if (isToday(d)) groups[0].items.push(n);
      else if (isYesterday(d)) groups[1].items.push(n);
      else if (isThisWeek(d, { weekStartsOn: 1 })) groups[2].items.push(n);
      else groups[3].items.push(n);
    });
    return groups.filter(g => g.items.length > 0);
  }, [visibleNotifications]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        className={cn(
          "relative p-2 rounded-lg transition-all duration-200",
          "hover:bg-muted active:scale-95",
          open && "bg-muted"
        )}
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <motion.div
          animate={unreadCount > 0 ? { rotate: [0, -10, 10, -6, 6, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          key={unreadCount}
        >
          <Bell className={cn("h-[18px] w-[18px] transition-colors", unreadCount > 0 ? "text-foreground" : "text-muted-foreground")} />
        </motion.div>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-background"
            >
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
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ position: "fixed", top: pos.top, right: pos.right }}
              className={cn(
                "w-[360px] sm:w-[400px] rounded-2xl overflow-hidden z-[100]",
                "bg-card/95 backdrop-blur-xl border border-border/60",
                "shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3),0_8px_20px_-8px_rgba(0,0,0,0.2)]"
              )}
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[15px] text-foreground tracking-tight">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group"
                    >
                      <Check className="h-3 w-3 group-hover:text-primary transition-colors" />
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 p-0.5 bg-muted/60 rounded-lg w-fit">
                  {(["all", "unread"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "relative px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize",
                        tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab === t && (
                        <motion.div
                          layoutId="notif-tab-pill"
                          className="absolute inset-0 bg-background rounded-md shadow-sm"
                          transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className="relative">
                        {t} {t === "unread" && unreadCount > 0 && `(${unreadCount})`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* List */}
              <div className="max-h-[420px] overflow-y-auto px-1.5 pb-1.5 scrollbar-thin">
                {visibleNotifications.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="py-14 text-center"
                  >
                    <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-muted/60 flex items-center justify-center">
                      <Inbox className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {tab === "unread" ? "You're all caught up" : "No notifications yet"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tab === "unread" ? "New activity will show up here." : "We'll let you know when something happens."}
                    </p>
                  </motion.div>
                ) : (
                  <div className="space-y-3 pt-1">
                    {grouped.map((group) => (
                      <div key={group.label}>
                        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          {group.label}
                        </p>
                        <div className="space-y-0.5">
                          {group.items.map((notif, i) => {
                            const config = typeConfig[notif.type];
                            const Icon = config.icon;
                            return (
                              <motion.div
                                key={notif.id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(i * 0.02, 0.15) }}
                                className={cn(
                                  "group relative flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150",
                                  "hover:bg-muted/60",
                                  !notif.read && "bg-primary/[0.04]"
                                )}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  markOneRead(notif.id);
                                  setOpen(false);
                                  // Always try to navigate somewhere useful, even if link missing.
                                  const fallback = notif.type.startsWith("sm2") || notif.type === "client_note" || notif.type === "post_approved" || notif.type === "post_flagged" || notif.type === "comment_added"
                                    ? "/social"
                                    : notif.type === "ticket_created" || notif.type === "status_changed"
                                      ? "/social?tab=tickets"
                                      : "/";
                                  navigate(notif.link || fallback);
                                }}
                              >
                                {!notif.read && (
                                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-primary" />
                                )}
                                <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", config.bg)}>
                                  <Icon className={cn("h-[18px] w-[18px]", config.color)} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={cn("text-[13px] truncate", !notif.read ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>
                                      {notif.title}
                                    </p>
                                    {notif.clinicName && (
                                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary/10 text-primary truncate max-w-[160px]">
                                        {notif.clinicName}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2 leading-snug mt-0.5">{notif.message}</p>
                                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true })}
                                  </p>
                                </div>
                                {!notif.read && (
                                  <div className="flex flex-col items-center gap-1 shrink-0">
                                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                                  </div>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="px-4 py-2.5 border-t border-border/60 bg-muted/20 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Showing {visibleNotifications.length} of {notifications.length}
                  </span>
                  <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    <Settings2 className="h-3 w-3" />
                    Preferences
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
