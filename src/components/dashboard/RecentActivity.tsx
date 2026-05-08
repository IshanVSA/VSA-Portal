import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2, Send, Sparkles, Ticket, FileText, Clock,
} from "lucide-react";
import type { DashboardFilter } from "./AdminDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const deptRoute: Record<string, string> = {
  website: "/website",
  seo: "/seo",
  google_ads: "/google-ads",
  social_media: "/social",
};

function buildHref(item: UnifiedActivity): string {
  const clinic = item.clinic_id ? `clinic=${item.clinic_id}` : "";
  if (item.type === "ticket") {
    const base = deptRoute[item.department || ""] || "/";
    const params = [clinic, "tab=tickets"].filter(Boolean).join("&");
    return `${base}?${params}`;
  }
  if (item.type === "content_request") {
    const params = [clinic, "tab=requests"].filter(Boolean).join("&");
    return `/social?${params}`;
  }
  return "/";
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

  useEffect(() => {
    const fetchAll = async () => {
      const [profilesRes, clinicsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name"),
        supabase.from("clinics").select("id, clinic_name"),
      ]);
      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p.full_name || "Unknown"]));
      const clinicMap = new Map((clinicsRes.data || []).map(c => [c.id, c.clinic_name]));

      const [ticketsRes, contentRequestsRes] = await Promise.all([
        supabase.from("department_tickets").select("id, title, department, priority, status, created_at, updated_at, created_by, clinic_id").order("created_at", { ascending: false }).limit(40),
        supabase.from("content_requests").select("id, status, created_at, created_by_concierge_id, clinic_id, intake_data").order("created_at", { ascending: false }).limit(40),
      ]);

      const activities: UnifiedActivity[] = [];

      const statusLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
        generated: { label: "Monthly calendar created", color: "text-primary", icon: Sparkles },
        concierge_preferred: { label: "Calendar sent for review", color: "text-[hsl(var(--dept-seo))]", icon: Send },
        admin_approved: { label: "Calendar approved", color: "text-success", icon: CheckCircle2 },
        client_selected: { label: "Calendar approved by client", color: "text-[hsl(var(--dept-social))]", icon: CheckCircle2 },
        final_approved: { label: "Calendar finalized", color: "text-success", icon: CheckCircle2 },
      };

      (contentRequestsRes.data || []).forEach((cr: any) => {
        const conciergeName = profileMap.get(cr.created_by_concierge_id) || "A concierge";
        const clinicName = cr.clinic_id ? clinicMap.get(cr.clinic_id) || "a clinic" : "a clinic";
        const intake = cr.intake_data as any;
        const month = intake?.month || "";
        const cfg = statusLabels[cr.status] || { label: `Calendar ${cr.status.replace(/_/g, " ")}`, color: "text-muted-foreground", icon: FileText };
        activities.push({
          id: `cr-${cr.id}`,
          type: "content_request",
          label: cfg.label,
          description: `${month ? month + " " : ""}for ${clinicName} by ${conciergeName}`,
          created_at: cr.created_at,
          icon: cfg.icon,
          color: cfg.color,
          clinic_id: cr.clinic_id || null,
          department: null,
          status: cr.status || null,
        });
      });

      const ticketStatusMeta: Record<string, { label: string; icon: React.ElementType; color: string }> = {
        in_progress: { label: "Ticket in progress", icon: Clock, color: "text-warning" },
        completed: { label: "Ticket completed", icon: CheckCircle2, color: "text-success" },
        void: { label: "Ticket voided", icon: Ticket, color: "text-muted-foreground" },
        emergency: { label: "Ticket marked emergency", icon: Ticket, color: "text-destructive" },
      };

      (ticketsRes.data || []).forEach((t: any) => {
        const creatorName = t.created_by ? profileMap.get(t.created_by) || "Someone" : "Someone";
        const clinicName = t.clinic_id ? clinicMap.get(t.clinic_id) : null;
        const deptLabel = t.department?.replace("_", " ") || "Unknown";
        const priority = priorityLabels[t.priority] || "";
        let desc = `"${t.title}" in ${deptLabel}${priority}`;
        if (clinicName) desc += ` for ${clinicName}`;
        desc += ` by ${creatorName}`;

        // Always emit a creation event
        activities.push({
          id: `ticket-${t.id}-created`,
          type: "ticket",
          label: "Ticket created",
          description: desc,
          created_at: t.created_at,
          icon: Ticket,
          color: t.priority === "emergency" ? "text-destructive" : t.priority === "urgent" ? "text-warning" : "text-primary",
          clinic_id: t.clinic_id || null,
          department: t.department || null,
          status: "open",
        });

        // Emit a separate status-change event if the ticket is no longer open
        if (t.status && t.status !== "open" && t.updated_at && t.updated_at !== t.created_at) {
          const meta = ticketStatusMeta[t.status] || { label: `Ticket ${t.status.replace("_", " ")}`, icon: Ticket, color: "text-muted-foreground" };
          activities.push({
            id: `ticket-${t.id}-${t.status}`,
            type: "ticket",
            label: meta.label,
            description: desc,
            created_at: t.updated_at,
            icon: meta.icon,
            color: meta.color,
            clinic_id: t.clinic_id || null,
            department: t.department || null,
            status: t.status,
          });
        }
      });

      activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllItems(activities);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const items = allItems
    .filter(i => {
      if (filter?.clinicId && i.clinic_id !== filter.clinicId) return false;
      if (filter?.department && i.department !== filter.department) return false;
      if (filter?.status && i.status !== filter.status) return false;
      return true;
    })
    .slice(0, 12);

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
          /* Timeline layout */
          <div className="relative max-h-[380px] overflow-y-auto">
            <div className="absolute left-[23px] top-0 bottom-0 w-px bg-border/60" />
            <ul className="py-2">
              {items.map((item) => {
                const Icon = item.icon;
                const isClosed = item.type === "ticket" && (item.status === "completed" || item.status === "void");
                const href = buildHref(item);
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
