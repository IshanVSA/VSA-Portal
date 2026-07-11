import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

interface KPICardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  index?: number;
  gradient?: "blue" | "green" | "amber" | "purple";
  href?: string;
}

const iconBgMap = {
  blue: "bg-primary/12",
  green: "bg-success/12",
  amber: "bg-warning/12",
  purple: "bg-[hsl(280,65%,60%)]/12",
};

const iconColorMap = {
  blue: "text-primary",
  green: "text-success",
  amber: "text-warning",
  purple: "text-[hsl(280,65%,60%)]",
};

export default function KPICard({ label, value, change, changeType = "neutral", icon: Icon, index = 0, gradient = "blue", href }: KPICardProps) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      whileHover={href ? { y: -2, transition: { duration: 0.2 } } : undefined}
      className={cn(
        "relative bg-card rounded-2xl border border-border/60 p-4 sm:p-5 transition-shadow duration-200 group min-w-0",
        href && "cursor-pointer"
      )}
      style={{ boxShadow: "var(--shadow-sm)" }}
      onMouseEnter={(e) => { if (href) (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)"; }}
      onMouseLeave={(e) => { if (href) (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)"; }}
    >
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className={cn("h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center shrink-0", iconBgMap[gradient])}>
          <Icon className={cn("h-4 w-4 sm:h-[18px] sm:w-[18px]", iconColorMap[gradient])} />
        </div>
        {change && (
          <span className={cn(
            "text-[10px] sm:text-[11px] font-semibold px-1.5 sm:px-2 py-0.5 rounded-full truncate max-w-full",
            changeType === "positive" && "bg-success/12 text-success",
            changeType === "negative" && "bg-destructive/12 text-destructive",
            changeType === "neutral" && "bg-muted text-muted-foreground"
          )}>
            {change}
          </span>
        )}
      </div>
      <p className="text-[12px] sm:text-[13px] text-muted-foreground font-medium mb-1 truncate">{label}</p>
      <p className="text-[20px] sm:text-[28px] lg:text-[32px] font-bold text-foreground tracking-tight tabular-nums leading-tight truncate">{value}</p>
    </motion.div>
  );

  if (href) {
    return <Link to={href} className="block">{content}</Link>;
  }

  return content;
}