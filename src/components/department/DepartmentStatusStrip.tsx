import { useNavigate } from "react-router-dom";
import { Inbox, Clock, CheckCircle2, AlertTriangle, LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DepartmentStatusStripProps {
  department: string;
  clinicId?: string;
  counts: { open: number; inProgress: number; completed: number; emergency: number };
}

const DEPT_ROUTE: Record<string, string> = {
  website: "/website",
  seo: "/seo",
  google_ads: "/google-ads",
  social_media: "/social",
  ai_seo: "/ai-seo",
};

export function DepartmentStatusStrip({ department, clinicId, counts }: DepartmentStatusStripProps) {
  const navigate = useNavigate();
  const base = DEPT_ROUTE[department] || `/${department}`;
  const go = () => {
    const qs = new URLSearchParams({ tab: "tickets" });
    if (clinicId) qs.set("clinic", clinicId);
    navigate(`${base}?${qs.toString()}`);
  };

  const cards: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
    iconColor: string;
    iconBg: string;
    emphasizeBorder?: boolean;
  }> = [
    { label: "Open", value: counts.open, icon: Inbox, iconColor: "text-primary", iconBg: "bg-primary/10" },
    { label: "In progress", value: counts.inProgress, icon: Clock, iconColor: "text-warning", iconBg: "bg-warning/10" },
    { label: "Completed", value: counts.completed, icon: CheckCircle2, iconColor: "text-success", iconBg: "bg-success/10" },
    { label: "Emergency", value: counts.emergency, icon: AlertTriangle, iconColor: "text-destructive", iconBg: "bg-destructive/10", emphasizeBorder: counts.emergency > 0 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <motion.button
          key={c.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
          onClick={go}
          className={cn(
            "text-left rounded-2xl border bg-card shadow-sm p-4 hover:shadow-md hover:border-primary/40 transition-all",
            c.emphasizeBorder ? "border-destructive" : "border-border/60"
          )}
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <div className="flex items-center justify-between">
            <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center", c.iconBg)}>
              <c.icon className={cn("h-4 w-4", c.iconColor)} />
            </div>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-3">{c.label}</p>
          <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">{c.value}</p>
        </motion.button>
      ))}
    </div>
  );
}
