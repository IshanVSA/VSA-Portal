import { LucideIcon } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  index?: number;
}

export function StatsCard({
  title,
  value,
  icon,
  description,
  change,
  changeType,
  index,
}: StatsCardProps) {
  return (
    <MetricCard
      label={title}
      value={value}
      icon={icon}
      description={description}
      change={change}
      changeType={changeType}
      accent="blue"
      size="sm"
      index={index}
    />
  );
}
