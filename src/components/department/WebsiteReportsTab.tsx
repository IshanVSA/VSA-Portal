import { useState, useEffect, useMemo, useCallback } from "react";
import { format, differenceInMilliseconds } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Eye, Users, TrendingUp, Clock, Globe, BarChart3, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PDF_COLORS, renderPDFHeader, renderSectionHeader, renderKPICards,
  getTableStyles, colorChangeCell, finalizePDF, ensureSpace,
} from "@/lib/pdf-theme";
import {
  buildDateKeys,
  computeWebsiteMetrics,
  DEFAULT_CLINIC_TIMEZONE,
  fetchAllPageviews,
  getBufferedRange,
  getMonthDateRangeForTimeZone,
  getSafeTimeZone,
  getTrailingDateRangeForTimeZone,
  WebsiteMetrics,
} from "@/lib/website-analytics";

interface Props {
  clinicId: string;
}

type ReportPeriod = "last7" | "last30" | "last90" | "this_month" | "last_month";

const periodLabels: Record<ReportPeriod, string> = {
  last7: "Last 7 Days",
  last30: "Last 30 Days",
  last90: "Last 90 Days",
  this_month: "This Month",
  last_month: "Last Month",
};

function getDateRange(period: ReportPeriod, timeZone: string): { from: Date; to: Date } {
  switch (period) {
    case "last7":
      return getTrailingDateRangeForTimeZone(timeZone, 7);
    case "last30":
      return getTrailingDateRangeForTimeZone(timeZone, 30);
    case "last90":
      return getTrailingDateRangeForTimeZone(timeZone, 90);
    case "this_month":
      return getMonthDateRangeForTimeZone(timeZone);
    case "last_month":
      return getMonthDateRangeForTimeZone(timeZone, -1);
  }
}

function getPrevRange(range: { from: Date; to: Date }): { from: Date; to: Date } {
  const duration = differenceInMilliseconds(range.to, range.from);
  const prevTo = new Date(range.from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - duration);
  return { from: prevFrom, to: prevTo };
}

function formatDuration(s: number): string {
  if (s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function pctChange(cur: number, prev: number, invertBetter = false): { pct: number; text: string; type: "positive" | "negative" | "neutral" } {
  if (prev === 0 && cur === 0) return { pct: 0, text: "No change", type: "neutral" };
  if (prev === 0) return { pct: 100, text: `+${cur} (new)`, type: invertBetter ? "negative" : "positive" };
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  const sign = pct >= 0 ? "+" : "";
  let type: "positive" | "negative" | "neutral" = pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral";
  if (invertBetter) type = type === "positive" ? "negative" : type === "negative" ? "positive" : "neutral";
  return { pct, text: `${sign}${pct}%`, type };
}

export function WebsiteReportsTab({ clinicId }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>("last30");
  const [pageviews, setPageviews] = useState<any[]>([]);
  const [prevPageviews, setPrevPageviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicName, setClinicName] = useState("");
  const [timeZone, setTimeZone] = useState(DEFAULT_CLINIC_TIMEZONE);
  const [timezoneReady, setTimezoneReady] = useState(false);
  const [generating, setGenerating] = useState(false);

  const range = useMemo(() => getDateRange(period, timeZone), [period, timeZone]);
  const prevRange = useMemo(() => getPrevRange(range), [range]);
  const rangeDateKeys = useMemo(() => buildDateKeys(range.from, range.to), [range]);
  const prevRangeDateKeys = useMemo(() => buildDateKeys(prevRange.from, prevRange.to), [prevRange]);

  useEffect(() => {
    if (!clinicId) {
      setLoading(false);
      setTimezoneReady(false);
      return;
    }

    const fetchClinicMeta = async () => {
      setLoading(true);
      setTimezoneReady(false);

      const { data: clinicData } = await supabase
        .from("clinics")
        .select("clinic_name, timezone")
        .eq("id", clinicId)
        .single();

      setClinicName(clinicData?.clinic_name || "Unknown Clinic");
      setTimeZone(getSafeTimeZone(clinicData?.timezone));
      setTimezoneReady(true);
    };

    fetchClinicMeta();
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId || !timezoneReady) return;

    const fetchAll = async () => {
      setLoading(true);
      const currentBufferedRange = getBufferedRange(range.from, range.to);
      const previousBufferedRange = getBufferedRange(prevRange.from, prevRange.to);
      const [{ data: pvData }, { data: prevData }] = await Promise.all([
        supabase.from("website_pageviews").select("session_id, path, referrer, created_at").eq("clinic_id", clinicId).gte("created_at", currentBufferedRange.from.toISOString()).lte("created_at", currentBufferedRange.to.toISOString()).order("created_at", { ascending: true }),
        supabase.from("website_pageviews").select("session_id, path, referrer, created_at").eq("clinic_id", clinicId).gte("created_at", previousBufferedRange.from.toISOString()).lte("created_at", previousBufferedRange.to.toISOString()),
      ]);
      setPageviews((pvData as any[] | null) || []);
      setPrevPageviews((prevData as any[] | null) || []);
      setLoading(false);
    };

    fetchAll();
  }, [clinicId, prevRange, range, timezoneReady]);

  const metrics = useMemo<WebsiteMetrics | null>(() => (pageviews.length > 0 ? computeWebsiteMetrics(pageviews, rangeDateKeys, timeZone) : null), [pageviews, rangeDateKeys, timeZone]);
  const prevMetrics = useMemo<WebsiteMetrics | null>(() => (prevPageviews.length > 0 ? computeWebsiteMetrics(prevPageviews, prevRangeDateKeys, timeZone) : null), [prevPageviews, prevRangeDateKeys, timeZone]);

  const changes = useMemo(() => {
    if (!metrics) return null;
    const pm = prevMetrics || { totalViews: 0, totalSessions: 0, engagedSessions: 0, avgDuration: 0, pagesPerSession: 0 };
    return {
      views: pctChange(metrics.totalViews, pm.totalViews),
      visitors: pctChange(metrics.totalSessions, pm.totalSessions),
      engagement: pctChange(metrics.engagedSessions, pm.engagedSessions),
      duration: pctChange(metrics.avgDuration, pm.avgDuration),
      pages: pctChange(metrics.pagesPerSession, pm.pagesPerSession),
    };
  }, [metrics, prevMetrics]);

  const generatePDF = useCallback(async () => {
    if (!metrics || !changes) return;
    setGenerating(true);

    try {
      const doc = new jsPDF();
      const dateStr = `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`;
      const prevDateStr = `${format(prevRange.from, "MMM d")} – ${format(prevRange.to, "MMM d")}`;

      // ── Header ──
      let y = renderPDFHeader(doc, "Website Performance Report", clinicName, dateStr, PDF_COLORS.website);

      // ── KPI Cards ──
      const pm = prevMetrics || { totalViews: 0, totalSessions: 0, engagedSessions: 0, avgDuration: 0, pagesPerSession: 0 };
      y = renderKPICards(doc, y, [
        { label: "Page Views", value: metrics.totalViews.toLocaleString(), change: changes.views.text },
        { label: "Visitors", value: metrics.totalSessions.toLocaleString(), change: changes.visitors.text },
        { label: "Engaged Sessions", value: metrics.engagedSessions.toLocaleString(), change: changes.engagement.text },
        { label: "Avg. Session", value: formatDuration(metrics.avgDuration), change: changes.duration.text },
      ], PDF_COLORS.website);

      // ── Key Metrics Table ──
      y = renderSectionHeader(doc, "Key Metrics", y, PDF_COLORS.website, `Compared to previous period (${prevDateStr})`);

      autoTable(doc, {
        startY: y,
        head: [["Metric", "Current", "Previous", "Change"]],
        body: [
          ["Page Views", metrics.totalViews.toLocaleString(), pm.totalViews.toLocaleString(), changes.views.text],
          ["Unique Visitors", metrics.totalSessions.toLocaleString(), pm.totalSessions.toLocaleString(), changes.visitors.text],
          ["Engaged Sessions", metrics.engagedSessions.toLocaleString(), pm.engagedSessions.toLocaleString(), changes.engagement.text],
          ["Avg. Session Duration", formatDuration(metrics.avgDuration), formatDuration(pm.avgDuration), changes.duration.text],
          ["Pages per Session", metrics.pagesPerSession.toString(), pm.pagesPerSession.toString(), changes.pages.text],
        ],
        ...getTableStyles(PDF_COLORS.website),
        didParseCell: (data: any) => colorChangeCell(data, 3),
      });
      y = (doc as any).lastAutoTable?.finalY || y + 50;

      // ── Daily Traffic ──
      y = ensureSpace(doc, y + 8, 60);
      y = renderSectionHeader(doc, "Daily Traffic", y, PDF_COLORS.website);

      autoTable(doc, {
        startY: y,
        head: [["Date", "Page Views"]],
        body: metrics.dailyTraffic.map(d => [d.label, d.count.toString()]),
        ...getTableStyles(PDF_COLORS.website),
      });
      y = (doc as any).lastAutoTable?.finalY || y + 50;

      // ── Top Pages ──
      y = ensureSpace(doc, y + 8, 60);
      y = renderSectionHeader(doc, "Top Pages", y, PDF_COLORS.website);

      autoTable(doc, {
        startY: y,
        head: [["Page", "Views", "Visitors"]],
        body: metrics.topPages.map(p => [p.pageName, p.views.toString(), p.visitors.toString()]),
        ...getTableStyles(PDF_COLORS.website),
        columnStyles: { 0: { cellWidth: 100 } },
      });
      y = (doc as any).lastAutoTable?.finalY || y + 50;

      // ── Pages / Session Mix ──
      y = ensureSpace(doc, y + 8, 60);
      y = renderSectionHeader(doc, "Pages / Session Mix", y, PDF_COLORS.website);

      autoTable(doc, {
        startY: y,
        head: [["Bucket", "Sessions", "Share"]],
        body: metrics.sessionDepthMix.map(bucket => [bucket.label, bucket.sessions.toString(), `${bucket.share}%`]),
        ...getTableStyles(PDF_COLORS.website),
        columnStyles: { 0: { cellWidth: 100 } },
      });

      await finalizePDF(doc);
      doc.save(`${clinicName.replace(/\s+/g, "_")}_Website_Report_${format(range.from, "yyyy-MM-dd")}.pdf`);
    } finally {
      setGenerating(false);
    }
  }, [metrics, prevMetrics, changes, clinicName, range, prevRange]);

  if (!clinicId) {
    return <p className="text-muted-foreground text-sm text-center py-12">Select a clinic to generate reports.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Generate Website Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Report Period</label>
              <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(periodLabels) as [ReportPeriod, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generatePDF} disabled={loading || !metrics || generating} className="gap-2">
              <Download className="h-4 w-4" />
              {generating ? "Generating…" : "Download PDF Report"}
            </Button>
          </div>
          {loading && <p className="text-xs text-muted-foreground mt-3">Loading data…</p>}
          {!loading && !metrics && <p className="text-xs text-muted-foreground mt-3">No data available for this period.</p>}
        </CardContent>
      </Card>

      {metrics && changes && !loading && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Report Preview - {periodLabels[period]}
              </CardTitle>
              <span className="text-[10px] text-muted-foreground">
                {timeZone} · vs {format(prevRange.from, "MMM d")} – {format(prevRange.to, "MMM d")}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
              <PreviewStat icon={Eye} label="Page Views" value={metrics.totalViews.toLocaleString()} change={changes.views} />
              <PreviewStat icon={Users} label="Visitors" value={metrics.totalSessions.toLocaleString()} change={changes.visitors} />
              <PreviewStat icon={TrendingUp} label="Engaged Sessions" value={metrics.engagedSessions.toLocaleString()} change={changes.engagement} />
              <PreviewStat icon={Clock} label="Avg. Session" value={formatDuration(metrics.avgDuration)} change={changes.duration} />
              <PreviewStat icon={Globe} label="Pages/Session" value={metrics.pagesPerSession.toString()} change={changes.pages} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Top Pages</h4>
                <div className="space-y-1">
                  {metrics.topPages.slice(0, 5).map(p => (
                    <div key={p.path} className="flex justify-between text-xs py-1 border-b border-border/50">
                      <div className="max-w-[200px] min-w-0">
                        <div className="truncate font-medium">{p.pageName}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{p.path}</div>
                      </div>
                      <span className="tabular-nums text-muted-foreground">{p.views} views</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Pages / Session Mix</h4>
                <div className="space-y-1">
                  {metrics.sessionDepthMix.map(bucket => (
                    <div key={bucket.label} className="flex justify-between text-xs py-1 border-b border-border/50">
                      <span>{bucket.label}</span>
                      <span className="tabular-nums text-muted-foreground">{bucket.sessions} sessions · {bucket.share}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ChangeInfo {
  pct: number;
  text: string;
  type: "positive" | "negative" | "neutral";
}

function PreviewStat({ icon: Icon, label, value, change }: { icon: React.ElementType; label: string; value: string; change: ChangeInfo }) {
  const ChangeIcon = change.type === "positive" ? ArrowUp : change.type === "negative" ? ArrowDown : Minus;
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
      <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <div className={cn("flex items-center justify-center gap-0.5 text-[10px] font-medium",
        change.type === "positive" ? "text-success" : change.type === "negative" ? "text-destructive" : "text-muted-foreground"
      )}>
        <ChangeIcon className="h-3 w-3" />
        <span>{change.text}</span>
      </div>
    </div>
  );
}
