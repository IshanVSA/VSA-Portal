import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle, CheckCircle2, Clock, RefreshCw, PlayCircle,
  AlertTriangle, HelpCircle, ShieldAlert,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Health = "healthy" | "stale" | "critical" | "unknown";

interface JobStatus {
  id: string;
  label: string;
  schedule: string;
  fn: string | null;
  last_at: string | null;
  failures_24h: number;
  total_24h: number;
  failure_sample: string | null;
  health: Health;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const HEALTH_META: Record<Health, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  healthy:  { label: "Healthy",  cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
  stale:    { label: "Stale",    cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",     Icon: Clock },
  critical: { label: "Critical", cls: "bg-red-500/10 text-red-400 border-red-500/30",            Icon: AlertCircle },
  unknown:  { label: "Unknown",  cls: "bg-muted text-muted-foreground border-border",            Icon: HelpCircle },
};

export default function CronMonitor() {
  const [jobs, setJobs] = useState<JobStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [confirmJob, setConfirmJob] = useState<JobStatus | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("cron-monitor", {
        body: null, method: "GET",
      });
      if (error) throw error;
      setJobs(data.jobs);
      setGeneratedAt(data.generated_at);
    } catch (e) {
      toast({ title: "Failed to load cron status", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const runJob = async (job: JobStatus) => {
    setConfirmJob(null);
    setRunningId(job.id);
    try {
      const { data, error } = await supabase.functions.invoke(
        `cron-monitor?action=run&job=${encodeURIComponent(job.id)}`,
        { body: {}, method: "POST" }
      );
      if (error) throw error;
      if (data?.ok) {
        toast({ title: `${job.label} triggered`, description: "Reload in a moment to see updated status." });
        setTimeout(() => load(true), 3000);
      } else {
        toast({ title: `Run failed (HTTP ${data?.status})`, description: data?.response?.slice(0, 200), variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Run failed", description: String(e), variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  };

  const failingCount = jobs?.filter((j) => j.health === "critical").length ?? 0;
  const staleCount   = jobs?.filter((j) => j.health === "stale").length ?? 0;

  return (
    <div className="container mx-auto py-8 px-6 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cron Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Last refresh: {generatedAt ? relativeTime(generatedAt) : "—"}
            {failingCount > 0 && <span className="ml-3 text-red-400">· {failingCount} critical</span>}
            {staleCount   > 0 && <span className="ml-3 text-amber-400">· {staleCount} stale</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {failingCount > 0 && jobs && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/5">
          <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-400">
              {failingCount} job{failingCount === 1 ? " is" : "s are"} failing or overdue.
            </p>
            <p className="text-muted-foreground mt-1">
              Admins receive an email digest automatically. Use the Run button to retry manually.
            </p>
          </div>
        </div>
      )}

      <Card className="glass-card overflow-hidden p-0">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {jobs?.map((job) => {
              const meta = HEALTH_META[job.health];
              const Icon = meta.Icon;
              return (
                <div key={job.id} className="flex items-center gap-4 p-5 hover:bg-muted/30 transition-colors">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center border ${meta.cls}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{job.label}</span>
                      <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">{job.schedule}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span>Last signal: <span className="text-foreground">{relativeTime(job.last_at)}</span></span>
                      {job.total_24h > 0 && (
                        <span>
                          24h: {job.total_24h - job.failures_24h}/{job.total_24h} ok
                          {job.failures_24h > 0 && <span className="text-red-400"> · {job.failures_24h} failed</span>}
                        </span>
                      )}
                    </div>
                    {job.failure_sample && (
                      <div className="mt-2 text-xs text-red-400/80 font-mono bg-red-500/5 border border-red-500/20 rounded px-2 py-1.5 truncate">
                        <AlertTriangle className="inline h-3 w-3 mr-1" />
                        {job.failure_sample}
                      </div>
                    )}
                  </div>
                  <div>
                    {job.fn ? (
                      <Button
                        variant="outline" size="sm" className="gap-2"
                        disabled={runningId === job.id}
                        onClick={() => setConfirmJob(job)}
                      >
                        <PlayCircle className="h-4 w-4" />
                        {runningId === job.id ? "Running…" : "Run now"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">DB-only</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AlertDialog open={!!confirmJob} onOpenChange={(o) => !o && setConfirmJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run {confirmJob?.label} now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will invoke the underlying edge function immediately. The job will still run on its normal schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmJob && runJob(confirmJob)}>
              Run now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
