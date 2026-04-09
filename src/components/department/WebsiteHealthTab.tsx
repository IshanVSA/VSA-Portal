import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RefreshCw, Smartphone, Monitor, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";

interface WebsiteHealthTabProps {
  clinicId: string;
}

interface MetricsJson {
  fcp: number;
  lcp: number;
  tbt: number;
  cls: number;
  si: number;
  fcp_display: string;
  lcp_display: string;
  tbt_display: string;
  cls_display: string;
  si_display: string;
}

interface ScoreRow {
  id: string;
  clinic_id: string;
  strategy: string;
  performance_score: number;
  accessibility_score: number;
  best_practices_score: number;
  seo_score: number;
  metrics_json: MetricsJson;
  recorded_at: string;
}

function scoreColor(score: number): string {
  if (score >= 90) return "hsl(var(--chart-2))"; // green
  if (score >= 50) return "hsl(var(--chart-4))"; // amber
  return "hsl(var(--destructive))"; // red
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Good";
  if (score >= 50) return "Needs Improvement";
  return "Poor";
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-foreground">{score}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function VitalMetric({ label, value, displayValue, thresholds }: {
  label: string;
  value: number;
  displayValue: string;
  thresholds: [number, number]; // [good, poor]
}) {
  const isGood = value <= thresholds[0];
  const isPoor = value > thresholds[1];
  const Icon = isGood ? CheckCircle2 : isPoor ? XCircle : AlertTriangle;
  const color = isGood ? "text-green-500" : isPoor ? "text-red-500" : "text-amber-500";

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold text-foreground">{displayValue || "—"}</span>
    </div>
  );
}

export function WebsiteHealthTab({ clinicId }: WebsiteHealthTabProps) {
  const [strategy, setStrategy] = useState<string>("mobile");
  const [running, setRunning] = useState(false);
  const queryClient = useQueryClient();

  // Get clinic website URL
  const { data: clinic } = useQuery({
    queryKey: ["clinic-website", clinicId],
    queryFn: async () => {
      if (!clinicId) return null;
      const { data } = await supabase.from("clinics").select("website").eq("id", clinicId).maybeSingle();
      return data;
    },
    enabled: !!clinicId,
  });

  // Get historical scores
  const { data: scores, isLoading } = useQuery({
    queryKey: ["pagespeed-scores", clinicId, strategy],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from("pagespeed_scores")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("strategy", strategy)
        .order("recorded_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as unknown as ScoreRow[]) || [];
    },
    enabled: !!clinicId,
  });

  const latest = scores?.[0] || null;
  const metrics = latest?.metrics_json as MetricsJson | null;

  const chartData = [...(scores || [])].reverse().map((s) => ({
    date: format(new Date(s.recorded_at), "MMM d"),
    Performance: s.performance_score,
    Accessibility: s.accessibility_score,
    "Best Practices": s.best_practices_score,
    SEO: s.seo_score,
  }));

  const runTest = async () => {
    if (!clinic?.website) {
      toast.error("No website URL configured for this clinic");
      return;
    }
    setRunning(true);
    try {
      // Run both mobile and desktop in parallel
      const strategies = ["mobile", "desktop"];
      const results = await Promise.allSettled(
        strategies.map((s) =>
          supabase.functions.invoke("pagespeed-insights", {
            body: { url: clinic.website, clinic_id: clinicId, strategy: s },
          })
        )
      );

      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error));
      if (failed.length > 0) {
        const firstFailed = failed[0];
        const errMsg = firstFailed.status === "fulfilled" && firstFailed.value.error
          ? await extractEdgeFunctionError(firstFailed.value.error, firstFailed.value.data, "PageSpeed test failed")
          : "PageSpeed test failed";
        toast.error(errMsg);
      } else {
        toast.success("PageSpeed test completed!");
      }

      queryClient.invalidateQueries({ queryKey: ["pagespeed-scores", clinicId] });
    } catch {
      toast.error("Failed to run PageSpeed test");
    } finally {
      setRunning(false);
    }
  };

  if (!clinicId) {
    return <div className="text-center py-12 text-muted-foreground">Select a clinic to view website health.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Website Health</h2>
          <p className="text-xs text-muted-foreground">
            {clinic?.website ? clinic.website : "No website URL configured"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ToggleGroup type="single" value={strategy} onValueChange={(v) => v && setStrategy(v)} className="bg-muted/50 rounded-lg p-0.5">
            <ToggleGroupItem value="mobile" className="gap-1.5 text-xs px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
              <Smartphone className="h-3.5 w-3.5" /> Mobile
            </ToggleGroupItem>
            <ToggleGroupItem value="desktop" className="gap-1.5 text-xs px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </ToggleGroupItem>
          </ToggleGroup>
          <Button size="sm" onClick={runTest} disabled={running || !clinic?.website}>
            <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
            {running ? "Running..." : "Run Test"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="p-6 flex justify-center"><div className="w-24 h-24 rounded-full bg-muted" /></CardContent></Card>
          ))}
        </div>
      ) : !latest ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No PageSpeed data yet. Run your first test!</p>
            <Button onClick={runTest} disabled={running || !clinic?.website}>
              <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
              Run First Test
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Score Gauges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Performance", score: latest.performance_score },
              { label: "Accessibility", score: latest.accessibility_score },
              { label: "Best Practices", score: latest.best_practices_score },
              { label: "SEO", score: latest.seo_score },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="p-5 flex flex-col items-center">
                  <ScoreGauge score={item.score} label={item.label} />
                  <span className="text-[10px] mt-1" style={{ color: scoreColor(item.score) }}>
                    {scoreLabel(item.score)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Core Web Vitals */}
          {metrics && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Core Web Vitals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <VitalMetric label="First Contentful Paint (FCP)" value={metrics.fcp} displayValue={metrics.fcp_display} thresholds={[1800, 3000]} />
                <VitalMetric label="Largest Contentful Paint (LCP)" value={metrics.lcp} displayValue={metrics.lcp_display} thresholds={[2500, 4000]} />
                <VitalMetric label="Total Blocking Time (TBT)" value={metrics.tbt} displayValue={metrics.tbt_display} thresholds={[200, 600]} />
                <VitalMetric label="Cumulative Layout Shift (CLS)" value={metrics.cls} displayValue={metrics.cls_display} thresholds={[0.1, 0.25]} />
                <VitalMetric label="Speed Index (SI)" value={metrics.si} displayValue={metrics.si_display} thresholds={[3400, 5800]} />
              </CardContent>
            </Card>
          )}

          {/* Historical Chart */}
          {chartData.length > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Score History ({strategy})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="Performance" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Accessibility" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Best Practices" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="SEO" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Last scanned */}
          <p className="text-[11px] text-muted-foreground text-right">
            Last scanned: {format(new Date(latest.recorded_at), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </>
      )}
    </div>
  );
}
