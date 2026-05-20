import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2, Send, Sparkles, Ticket, FileText, Clock, MessageSquare,
  MessagesSquare, BookOpen, Tag, Globe, Building2, Image as ImageIcon, ClipboardList,
} from "lucide-react";
import type { DashboardFilter } from "./AdminDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useUserDepartments, type DepartmentType } from "@/hooks/useUserDepartments";

const deptRoute: Record<string, string> = {
  website: "/website",
  seo: "/seo",
  google_ads: "/google-ads",
  social_media: "/social",
};

function buildHref(item: UnifiedActivity, allowedDepartments?: DepartmentType[] | null): string {
  const clinic = item.clinic_id ? `clinic=${item.clinic_id}` : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join("&");
  const resolveDept = (d: string | null | undefined) => {
    if (allowedDepartments && allowedDepartments.length > 0 && !allowedDepartments.includes((d || "") as DepartmentType)) {
      return allowedDepartments[0];
    }
    return d || "";
  };
  switch (item.type) {
    case "ticket": {
      const base = deptRoute[resolveDept(item.department)] || "/";
      return `${base}?${join(clinic, "tab=tickets")}`;
    }
    case "task": {
      const base = deptRoute[resolveDept(item.department)] || "/";
      const taskId = item.id.replace(/^task-/, "").replace(/-(created|done|in_progress)$/, "");
      return `${base}?${join(clinic, "tab=tasks", `task=${taskId}`)}`;
    }
    case "content_request":
    case "content_post":
    case "post_comment":
      return `/social?${join(clinic, "tab=requests")}`;
    case "sm2_generation":
      return `/social?${join(clinic, "tab=content")}`;
    case "blog_post":
      return `/seo?${join(clinic, "tab=blog")}`;
    case "gbp_post":
      return `/seo?${join(clinic, "tab=gbp")}`;
    case "promotion":
      return `/social?${join(clinic, "tab=promotions")}`;
    case "chat": {
      const base = deptRoute[resolveDept(item.department)] || "/";
      return `${base}?${join(clinic, "tab=chat")}`;
    }
    case "clinic_created":
      return item.clinic_id ? `/clinics/${item.clinic_id}` : "/clinics";
    default:
      return "/";
  }
}

interface UnifiedActivity {
  id: string;
  type: string;
  label: string;
  description: string;
  created_at: string;
  icon: React.ElementType;
  color: string;
  clinic_id: string | null;
  department: string | null;
  status: string | null;
}

const priorityLabels: Record<string, string> = {
  regular: "",
  urgent: " (Urgent)",
  emergency: " (Emergency)",
};

export default function RecentActivity({ filter }: { filter?: DashboardFilter } = {}) {
  const [allItems, setAllItems] = useState<UnifiedActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [extraTicketIds, setExtraTicketIds] = useState<Set<string>>(new Set());
  const { departments, isAllAccess } = useUserDepartments();

  useEffect(() => {
    const fetchAll = async () => {
      const [profilesRes, clinicsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name"),
        supabase.from("clinics").select("id, clinic_name"),
      ]);
      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p.full_name || "Unknown"]));
      const clinicMap = new Map((clinicsRes.data || []).map(c => [c.id, c.clinic_name]));
      const nameOf = (id: string | null | undefined) => (id && profileMap.get(id)) || "Someone";
      const clinicOf = (id: string | null | undefined) => (id && clinicMap.get(id)) || null;

      const [
        ticketsRes, contentRequestsRes, postCommentsRes, chatsRes,
        blogRes, sm2Res, promosRes, gbpRes, clinicNewRes, postsRes, tasksRes,
      ] = await Promise.all([
        supabase.from("department_tickets").select("id, title, department, priority, status, created_at, updated_at, created_by, clinic_id").order("created_at", { ascending: false }).limit(40),
        supabase.from("content_requests").select("id, status, created_at, created_by_concierge_id, clinic_id, intake_data").order("created_at", { ascending: false }).limit(40),
        supabase.from("post_comments").select("id, post_id, user_id, content, visibility, created_at").order("created_at", { ascending: false }).limit(40),
        supabase.from("department_chats").select("id, department, clinic_id, user_id, message, created_at").order("created_at", { ascending: false }).limit(40),
        supabase.from("blog_posts").select("id, clinic_id, generation_status, created_at, updated_at, blog_1_topic").order("updated_at", { ascending: false }).limit(30),
        supabase.from("sm2_generations").select("id, clinic_id, month_year, approval_status, created_at, updated_at, sent_to_client_at, approved_at").order("updated_at", { ascending: false }).limit(30),
        supabase.from("clinic_promotions").select("id, clinic_id, offer_name, status, created_by, created_at").order("created_at", { ascending: false }).limit(30),
        supabase.from("gbp_post_history").select("id, clinic_id, topic, status, created_at, generated_by").order("created_at", { ascending: false }).limit(30),
        supabase.from("clinics").select("id, clinic_name, created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("content_posts").select("id, clinic_id, title, workflow_stage, status, created_at, created_by, platform").order("created_at", { ascending: false }).limit(30),
        supabase.from("department_tasks" as any).select("id, title, department, priority, status, created_at, updated_at, created_by, assigned_to, clinic_id").order("updated_at", { ascending: false }).limit(40),
      ]);

      const postClinicMap = new Map<string, string | null>();
      (postsRes.data || []).forEach((p: any) => postClinicMap.set(p.id, p.clinic_id || null));

      // Fan-out aware: also surface tickets whose department_ticket_assignments
      // include a department the current user belongs to (e.g. Website ticket
      // with "Promote on Social Media: Yes" should appear for social_media).
      if (!isAllAccess && departments && departments.length > 0) {
        const ticketIds = (ticketsRes.data || []).map((t: any) => t.id);
        if (ticketIds.length > 0) {
          const { data: faRows } = await supabase
            .from("department_ticket_assignments")
            .select("ticket_id, department")
            .in("ticket_id", ticketIds)
            .in("department", departments);
          setExtraTicketIds(new Set((faRows || []).map((r: any) => r.ticket_id)));
        } else {
          setExtraTicketIds(new Set());
        }
      }

      const activities: UnifiedActivity[] = [];

      // ---- Content requests / calendar lifecycle ----
      const statusLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
        generated: { label: "Monthly calendar created", color: "text-primary", icon: Sparkles },
        concierge_preferred: { label: "Calendar sent for review", color: "text-[hsl(var(--dept-seo))]", icon: Send },
        admin_approved: { label: "Calendar approved", color: "text-success", icon: CheckCircle2 },
        client_selected: { label: "Calendar approved by client", color: "text-[hsl(var(--dept-social))]", icon: CheckCircle2 },
        final_approved: { label: "Calendar finalized", color: "text-success", icon: CheckCircle2 },
      };

      (contentRequestsRes.data || []).forEach((cr: any) => {
        const conciergeName = nameOf(cr.created_by_concierge_id);
        const clinicName = clinicOf(cr.clinic_id) || "a clinic";
        const intake = cr.intake_data as any;
        const month = intake?.month || "";
        const cfg = statusLabels[cr.status] || { label: `Calendar ${String(cr.status).replace(/_/g, " ")}`, color: "text-muted-foreground", icon: FileText };
        activities.push({
          id: `cr-${cr.id}`, type: "content_request",
          label: cfg.label,
          description: `${month ? month + " " : ""}for ${clinicName} by ${conciergeName}`,
          created_at: cr.created_at, icon: cfg.icon, color: cfg.color,
          clinic_id: cr.clinic_id || null, department: null, status: cr.status || null,
        });
      });

      // ---- Tickets (creation + status change) ----
      const ticketStatusMeta: Record<string, { label: string; icon: React.ElementType; color: string }> = {
        in_progress: { label: "Ticket in progress", icon: Clock, color: "text-warning" },
        completed: { label: "Ticket completed", icon: CheckCircle2, color: "text-success" },
        void: { label: "Ticket voided", icon: Ticket, color: "text-muted-foreground" },
        emergency: { label: "Ticket marked emergency", icon: Ticket, color: "text-destructive" },
      };

      (ticketsRes.data || []).forEach((t: any) => {
        const creatorName = nameOf(t.created_by);
        const clinicName = clinicOf(t.clinic_id);
        const deptLabel = t.department?.replace("_", " ") || "Unknown";
        const priority = priorityLabels[t.priority] || "";
        let desc = `"${t.title}" in ${deptLabel}${priority}`;
        if (clinicName) desc += ` for ${clinicName}`;
        desc += ` by ${creatorName}`;

        const isClosedTicket = t.status === "completed" || t.status === "void";

        activities.push({
          id: `ticket-${t.id}-created`, type: "ticket",
          label: "Ticket created", description: desc,
          created_at: t.created_at, icon: Ticket,
          color: t.priority === "emergency" ? "text-destructive" : t.priority === "urgent" ? "text-warning" : "text-primary",
          clinic_id: t.clinic_id || null, department: t.department || null,
          status: isClosedTicket ? t.status : "open",
        });

        // Show interim status changes (in_progress, emergency) but suppress completed/void
        // — for closed tickets we strike through the original "Ticket created" entry instead.
        if (
          t.status &&
          t.status !== "open" &&
          !isClosedTicket &&
          t.updated_at &&
          t.updated_at !== t.created_at
        ) {
          const meta = ticketStatusMeta[t.status] || { label: `Ticket ${String(t.status).replace("_", " ")}`, icon: Ticket, color: "text-muted-foreground" };
          activities.push({
            id: `ticket-${t.id}-${t.status}`, type: "ticket",
            label: meta.label, description: desc,
            created_at: t.updated_at, icon: meta.icon, color: meta.color,
            clinic_id: t.clinic_id || null, department: t.department || null, status: t.status,
          });
        }
      });

      // ---- Post comments ----
      (postCommentsRes.data || []).forEach((pc: any) => {
        const author = nameOf(pc.user_id);
        const snippet = (pc.content || "").slice(0, 80);
        const clinicId = postClinicMap.get(pc.post_id) ?? null;
        const clinicName = clinicOf(clinicId);
        activities.push({
          id: `comment-${pc.id}`, type: "post_comment",
          label: `${pc.visibility === "private" ? "Private" : pc.visibility === "internal" ? "Internal" : "Public"} comment`,
          description: `${author}${clinicName ? ` on a post for ${clinicName}` : ""}: "${snippet}"`,
          created_at: pc.created_at, icon: MessageSquare,
          color: pc.visibility === "private" ? "text-warning" : "text-primary",
          clinic_id: clinicId, department: null, status: null,
        });
      });

      // ---- Department chat messages ----
      (chatsRes.data || []).forEach((dc: any) => {
        const author = nameOf(dc.user_id);
        const clinicName = clinicOf(dc.clinic_id);
        const deptLabel = dc.department?.replace("_", " ") || "Unknown";
        const snippet = (dc.message || "").slice(0, 80);
        activities.push({
          id: `chat-${dc.id}`, type: "chat",
          label: `Chat in ${deptLabel}`,
          description: `${author}${clinicName ? ` (${clinicName})` : ""}: "${snippet}"`,
          created_at: dc.created_at, icon: MessagesSquare, color: "text-primary",
          clinic_id: dc.clinic_id || null, department: dc.department || null, status: null,
        });
      });

      // ---- Blog posts ----
      (blogRes.data || []).forEach((b: any) => {
        const clinicName = clinicOf(b.clinic_id) || "a clinic";
        const topic = b.blog_1_topic ? `: "${String(b.blog_1_topic).slice(0, 60)}"` : "";
        activities.push({
          id: `blog-${b.id}`, type: "blog_post",
          label: `Blog ${String(b.generation_status || "updated").replace(/_/g, " ")}`,
          description: `for ${clinicName}${topic}`,
          created_at: b.updated_at || b.created_at, icon: BookOpen,
          color: b.generation_status === "completed" ? "text-success" : b.generation_status === "failed" ? "text-destructive" : "text-primary",
          clinic_id: b.clinic_id || null, department: "seo", status: b.generation_status || null,
        });
      });

      // ---- SM2 generations ----
      (sm2Res.data || []).forEach((g: any) => {
        const clinicName = clinicOf(g.clinic_id) || "a clinic";
        const ts = g.approved_at || g.sent_to_client_at || g.updated_at || g.created_at;
        const label = g.approved_at ? "SM2 calendar approved"
          : g.sent_to_client_at ? "SM2 calendar sent to client"
          : `SM2 calendar ${String(g.approval_status || "updated").replace(/_/g, " ")}`;
        activities.push({
          id: `sm2-${g.id}`, type: "sm2_generation",
          label, description: `${g.month_year || ""} for ${clinicName}`.trim(),
          created_at: ts, icon: Sparkles,
          color: g.approval_status === "approved" ? "text-success" : "text-[hsl(var(--dept-social))]",
          clinic_id: g.clinic_id || null, department: "social_media", status: g.approval_status || null,
        });
      });

      // ---- Promotions ----
      (promosRes.data || []).forEach((p: any) => {
        const clinicName = clinicOf(p.clinic_id) || "a clinic";
        const author = nameOf(p.created_by);
        activities.push({
          id: `promo-${p.id}`, type: "promotion",
          label: "Promotion added",
          description: `"${p.offer_name}" for ${clinicName} by ${author}`,
          created_at: p.created_at, icon: Tag, color: "text-warning",
          clinic_id: p.clinic_id || null, department: "social_media", status: p.status || null,
        });
      });

      // ---- GBP posts ----
      (gbpRes.data || []).forEach((g: any) => {
        const clinicName = clinicOf(g.clinic_id) || "a clinic";
        activities.push({
          id: `gbp-${g.id}`, type: "gbp_post",
          label: `GBP post ${String(g.status || "created").replace(/_/g, " ")}`,
          description: `${g.topic ? `"${String(g.topic).slice(0, 60)}" ` : ""}for ${clinicName}`,
          created_at: g.created_at, icon: Globe,
          color: g.status === "published" ? "text-success" : "text-primary",
          clinic_id: g.clinic_id || null, department: "seo", status: g.status || null,
        });
      });

      // ---- Content posts (lifecycle) ----
      (postsRes.data || []).forEach((p: any) => {
        const clinicName = clinicOf(p.clinic_id) || "a clinic";
        const author = nameOf(p.created_by);
        activities.push({
          id: `post-${p.id}`, type: "content_post",
          label: `Post ${String(p.workflow_stage || p.status || "created").replace(/_/g, " ")}`,
          description: `${p.platform ? `[${p.platform}] ` : ""}"${(p.title || "").slice(0, 60)}" for ${clinicName} by ${author}`,
          created_at: p.created_at, icon: ImageIcon, color: "text-[hsl(var(--dept-social))]",
          clinic_id: p.clinic_id || null, department: "social_media", status: p.status || null,
        });
      });

      // ---- Department tasks ----
      (tasksRes.data || []).forEach((t: any) => {
        const creatorName = nameOf(t.created_by);
        const assigneeName = t.assigned_to ? nameOf(t.assigned_to) : null;
        const clinicName = clinicOf(t.clinic_id);
        const deptLabel = (t.department || "").replace("_", " ") || "Unknown";
        let desc = `"${t.title}" in ${deptLabel}`;
        if (clinicName) desc += ` for ${clinicName}`;
        desc += ` by ${creatorName}`;
        if (assigneeName) desc += ` → ${assigneeName}`;

        activities.push({
          id: `task-${t.id}-created`, type: "task",
          label: "Task created", description: desc,
          created_at: t.created_at, icon: ClipboardList,
          color: t.priority === "urgent" ? "text-destructive" : t.priority === "high" ? "text-warning" : "text-primary",
          clinic_id: t.clinic_id || null, department: t.department || null,
          status: t.status || "todo",
        });

        if (t.status === "done" && t.updated_at && t.updated_at !== t.created_at) {
          activities.push({
            id: `task-${t.id}-done`, type: "task",
            label: "Task completed", description: desc,
            created_at: t.updated_at, icon: CheckCircle2, color: "text-success",
            clinic_id: t.clinic_id || null, department: t.department || null, status: "done",
          });
        } else if (t.status === "in_progress" && t.updated_at && t.updated_at !== t.created_at) {
          activities.push({
            id: `task-${t.id}-in_progress`, type: "task",
            label: "Task in progress", description: desc,
            created_at: t.updated_at, icon: Clock, color: "text-warning",
            clinic_id: t.clinic_id || null, department: t.department || null, status: "in_progress",
          });
        }
      });

      // ---- New clinics ----
      (clinicNewRes.data || []).forEach((c: any) => {
        activities.push({
          id: `clinic-${c.id}`, type: "clinic_created",
          label: "Clinic added",
          description: c.clinic_name,
          created_at: c.created_at, icon: Building2, color: "text-success",
          clinic_id: c.id, department: null, status: null,
        });
      });

      activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllItems(activities);
      setLoading(false);
    };
    fetchAll();
  }, [isAllAccess, departments?.join(",")]);

  const items = allItems
    .filter(i => {
      if (filter?.clinicId && i.clinic_id !== filter.clinicId) return false;
      if (filter?.department && i.department !== filter.department) return false;
      if (filter?.status && i.status !== filter.status) return false;

      // Department scoping for staff (non-admin, non-client) users.
      if (!isAllAccess && departments) {
        const deptSet = new Set<DepartmentType>(departments);
        const ticketId = i.type === "ticket" ? i.id.replace(/^ticket-/, "").replace(/-(created|in_progress|completed|void|emergency)$/, "") : null;

        switch (i.type) {
          case "ticket": {
            if (i.department && deptSet.has(i.department as DepartmentType)) return true;
            return ticketId ? extraTicketIds.has(ticketId) : false;
          }
          case "chat":
            return !!(i.department && deptSet.has(i.department as DepartmentType));
          case "blog_post":
          case "gbp_post":
            return deptSet.has("seo");
          case "sm2_generation":
          case "promotion":
          case "content_post":
          case "content_request":
          case "post_comment":
            return deptSet.has("social_media");
          case "clinic_created":
            return true;
          default:
            return false;
        }
      }
      return true;
    })
    .slice(0, 25);

  if (loading) return null;

  return (
    <Card className="border-border/60">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Recent Activity</h3>
        <span className="text-xs text-muted-foreground">{items.length} events</span>
      </div>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No activity yet - events will appear here as your team works.</p>
          </div>
        ) : (
          <div className="relative max-h-[560px] overflow-y-auto">
            <div className="absolute left-[23px] top-0 bottom-0 w-px bg-border/60" />
            <ul className="py-2">
              {items.map((item) => {
                const Icon = item.icon;
                const isClosed = item.type === "ticket" && (item.status === "completed" || item.status === "void");
                const href = buildHref(item, isAllAccess ? null : departments);
                return (
                  <li key={item.id} className="relative">
                    <Link
                      to={href}
                      className="flex items-start gap-3 px-4 py-2 hover:bg-muted/30 transition-colors focus:outline-none focus:bg-muted/40"
                    >
                      <div className={cn("relative z-10 mt-0.5 h-5 w-5 rounded-full bg-card border-2 border-border flex items-center justify-center shrink-0")}>
                        <Icon className={cn("h-2.5 w-2.5", item.color)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm text-foreground leading-snug", isClosed && "line-through text-muted-foreground")}>
                          <span className="font-medium">{item.label}</span>
                          <span className="text-muted-foreground"> - {item.description}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(parseISO(item.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
