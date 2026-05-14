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
      className="bg-card rounded-xl border border-border/50 border-l-[3px] border-l-primary p-5 transition-shadow duration-200 h-full flex flex-col"
      style={{ boxShadow: "var(--shadow-sm)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-lg)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)"; }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">{title}</p>
        <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-none">{value}</p>
      {change && (
        <p className={cn(
          "text-xs font-medium mt-2",
          changeType === "positive" && "text-success",
          changeType === "negative" && "text-destructive",
          changeType === "neutral" && "text-muted-foreground"
        )}>
          {change}
        </p>
      )}
      {description && !change && <p className="text-xs text-muted-foreground mt-2">{description}</p>}
    </motion.div>
  );
}