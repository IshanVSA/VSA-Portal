import { useMemo } from "react";
import { subDays, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, PieChart as PieIcon } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { useGa4Traffic } from "@/hooks/useGa4Traffic";

const CHANNEL_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 65%, 60%)",
  "hsl(0, 84%, 60%)",
  "hsl(180, 70%, 45%)",
  "hsl(330, 70%, 55%)",
  "hsl(220, 15%, 50%)",
];

function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function SeoChannelOverview({ clinicId }: { clinicId: string | null }) {
  const dateRange = useMemo(() => {
    const today = new Date();
    return { from: subDays(today, 29), to: today };
  }, []);
  const { data } = useGa4Traffic(clinicId, dateRange);

  const channelColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    (data?.channelNames || []).forEach((ch, i) => {
      map[ch] = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
    });
    return map;
  }, [data?.channelNames]);

  if (!data?.isConnected || !data.totals.sessions) return null;

  const pieData = data.channels.map((c) => ({ name: c.channel, value: c.sessions }));
  const totalSessions = data.totals.sessions;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Sessions by Channel - line */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Sessions by Channel</h3>
        </div>
        <CardContent className="pt-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.daily} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => format(new Date(v), "MMM d")} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={36} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {data.channelNames.map((ch) => (
                  <Line key={ch} type="monotone" dataKey={ch} stroke={channelColorMap[ch]} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Default channel group - pie */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <PieIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Default Channel Group</h3>
        </div>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={channelColorMap[entry.name]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, n) => [`${formatNumber(v)} (${((v / totalSessions) * 100).toFixed(1)}%)`, n as string]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {data.channels.map((c) => (
                <div key={c.channel} className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: channelColorMap[c.channel] }} />
                    <span className="truncate text-foreground">{c.channel}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground ml-2">
                    {formatNumber(c.sessions)}
                    <span className="ml-1 text-[10px]">({((c.sessions / totalSessions) * 100).toFixed(1)}%)</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
