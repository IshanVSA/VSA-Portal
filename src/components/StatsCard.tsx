import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  index?: number;
}

export function StatsCard({ title, value, icon: Icon, description, change, changeType = "neutral", index = 0 }: StatsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="bg-card rounded-2xl border border-border/60 p-5 transition-shadow duration-200 h-full flex flex-col"
      style={{ boxShadow: "var(--shadow-sm)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)"; }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">{title}</p>
        <div className="h-9 w-9 rounded-xl bg-primary/12 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="text-2xl sm:text-[28px] font-semibold text-foreground tracking-tight leading-none">{value}</p>
      {change && (
        <span className={cn(
          "inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[11px] font-semibold mt-2.5",
          changeType === "positive" && "bg-success/12 text-success",
          changeType === "negative" && "bg-destructive/12 text-destructive",
          changeType === "neutral" && "bg-muted text-muted-foreground"
        )}>
          {change}
        </span>
      )}
      {description && !change && <p className="text-xs text-muted-foreground mt-2">{description}</p>}
    </motion.div>
  );
}