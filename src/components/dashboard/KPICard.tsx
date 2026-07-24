import { LucideIcon } from "lucide-react";
import { MetricCard, MetricAccent } from "@/components/ui/metric-card";

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

export default function KPICard({
  label,
  value,
  change,
  changeType,
  icon,
  index,
  gradient = "blue",
  href,
}: KPICardProps) {
  return (
    <MetricCard
      label={label}
      value={value}
      icon={icon}
      change={change}
      changeType={changeType}
      accent={gradient as MetricAccent}
      href={href}
      index={index}
      size="md"
    />
  );
}
