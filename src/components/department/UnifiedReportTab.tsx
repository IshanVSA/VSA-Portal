import { useState, useEffect, useMemo, useCallback } from "react";
import { format, differenceInMilliseconds } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Download, Globe, Search, Megaphone, Share2,
  BarChart3, Eye, Users, TrendingDown, Clock, TrendingUp,
  Link2, Hash, DollarSign, MousePointerClick, Target, Percent,
} from "lucide-react";
import { useSeoAnalytics, type SeoKeyword } from "@/hooks/useSeoAnalytics";
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
  getBufferedRange,
  getMonthDateRangeForTimeZone,
  getSafeTimeZone,
  getTrailingDateRangeForTimeZone,
  type WebsiteMetrics,
} from "@/lib/website-analytics";

interface Props {
  clinicId: string;
}

type ReportPeriod = "last30" | "this_month" | "last_month";

const periodLabels: Record<ReportPeriod, string> = {
  last30: "Last 30 Days",
  this_month: "This Month",
  last_month: "Last Month",
};

function getDateRange(period: ReportPeriod, timeZone: string): { from: Date; to: Date } {
  switch (period) {
    case "last30":
      return getTrailingDateRangeForTimeZone(timeZone, 30);
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

function fmtCurrency(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pctText(cur: number, prev: number): string {
  if (prev === 0 && cur === 0) return "No change";
  if (prev === 0) return `+${cur} (new)`;
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

interface WebMetrics {
  totalViews: number;
  totalSessions: number;
  bounceRate: number;
  avgDuration: number;
  pagesPerSession: number;
}

function calcWebMetrics(metrics: WebsiteMetrics): WebMetrics {
  const singlePageSessions = metrics.sessionDepthMix.find((bucket) => bucket.label === "1 page")?.sessions ?? 0;
  const bounceRate = metrics.totalSessions > 0
    ? Math.round((singlePageSessions / metrics.totalSessions) * 1000) / 10
    : 0;

  return {
    totalViews: metrics.totalViews,
    totalSessions: metrics.totalSessions,
    bounceRate,
    avgDuration: metrics.avgDuration,
    pagesPerSession: metrics.pagesPerSession,
  };
}

export function UnifiedReportTab({ clinicId }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>("last30");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [clinicName, setClinicName] = useState("");
  const [timeZone, setTimeZone] = useState(DEFAULT_CLINIC_TIMEZONE);
  const [timezoneReady, setTimezoneReady] = useState(false);

  const [webMetrics, setWebMetrics] = useState<WebMetrics | null>(null);
  const [prevWebMetrics, setPrevWebMetrics] = useState<WebMetrics | null>(null);

  const { rows: seoRows } = useSeoAnalytics(clinicId);
  const latestSeo = seoRows.length > 0 ? seoRows[seoRows.length - 1] : null;
  const prevSeo = seoRows.length > 1 ? seoRows[seoRows.length - 2] : null;

  const [adsData, setAdsData] = useState<any>(null);
  const [socialData, setSocialData] = useState<any[]>([]);

  const range = useMemo(() => getDateRange(period, timeZone), [period, timeZone]);
  const prevRange = useMemo(() => getPrevRange(range), [range]);

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
      const bufferedRange = getBufferedRange(range.from, range.to);
      const prevBufferedRange = getBufferedRange(prevRange.from, prevRange.to);
      const [{ data: pvData }, { data: prevPvData }, { data: adsRow }, { data: socialRows }] = await Promise.all([
        supabase.from("website_pageviews").select("session_id, path, created_at").eq("clinic_id", clinicId).gte("created_at", bufferedRange.from.toISOString()).lte("created_at", bufferedRange.to.toISOString()),
        supabase.from("website_pageviews").select("session_id, path, created_at").eq("clinic_id", clinicId).gte("created_at", prevBufferedRange.from.toISOString()).lte("created_at", prevBufferedRange.to.toISOString()),
        supabase.from("analytics").select("metrics_json").eq("clinic_id", clinicId).eq("platform", "google_ads").eq("metric_type", "monthly_summary").order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("analytics").select("platform, metric_type, value, date").eq("clinic_id", clinicId).in("platform", ["facebook", "instagram"]).order("recorded_at", { ascending: false }).limit(20),
      ]);
      const currentMetrics = computeWebsiteMetrics(
        ((pvData || []) as { session_id: string; path: string; created_at: string }[]),
        buildDateKeys(range.from, range.to),
        timeZone,
      );
      const previousMetrics = computeWebsiteMetrics(
        ((prevPvData || []) as { session_id: string; path: string; created_at: string }[]),
        buildDateKeys(prevRange.from, prevRange.to),
        timeZone,
      );

      setWebMetrics(currentMetrics.totalViews > 0 ? calcWebMetrics(currentMetrics) : null);
      setPrevWebMetrics(previousMetrics.totalViews > 0 ? calcWebMetrics(previousMetrics) : null);
      setAdsData(adsRow?.metrics_json || null);
      setSocialData(socialRows || []);
      setLoading(false);
    };
    fetchAll();
  }, [clinicId, prevRange, range, timeZone, timezoneReady]);

  const hasAnyData = webMetrics || latestSeo || adsData || socialData.length > 0;

  const generatePDF = useCallback(async () => {
    if (!hasAnyData) return;
    setGenerating(true);

    try {
      const doc = new jsPDF();
      const dateStr = `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`;

      // ── Header ──
      let y = renderPDFHeader(doc, "Unified Performance Report", clinicName, dateStr, PDF_COLORS.dark);

      // ──────── 1. WEBSITE ────────
      y = renderSectionHeader(doc, "Website Analytics", y, PDF_COLORS.website);

      if (webMetrics) {
        const pm = prevWebMetrics || { totalViews: 0, totalSessions: 0, bounceRate: 0, avgDuration: 0, pagesPerSession: 0 };
        autoTable(doc, {
          startY: y,
          head: [["Metric", "Current", "Previous", "Change"]],
          body: [
            ["Page Views", webMetrics.totalViews.toLocaleString(), pm.totalViews.toLocaleString(), pctText(webMetrics.totalViews, pm.totalViews)],
            ["Visitors", webMetrics.totalSessions.toLocaleString(), pm.totalSessions.toLocaleString(), pctText(webMetrics.totalSessions, pm.totalSessions)],
            ["Bounce Rate", `${webMetrics.bounceRate}%`, `${pm.bounceRate}%`, pctText(webMetrics.bounceRate, pm.bounceRate)],
            ["Avg. Session", formatDuration(webMetrics.avgDuration), formatDuration(pm.avgDuration), pctText(webMetrics.avgDuration, pm.avgDuration)],
            ["Pages/Session", webMetrics.pagesPerSession.toString(), pm.pagesPerSession.toString(), pctText(webMetrics.pagesPerSession, pm.pagesPerSession)],
          ],
          ...getTableStyles(PDF_COLORS.website),
          didParseCell: (data: any) => colorChangeCell(data, 3),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 40;
      } else {
        doc.setFontSize(9);
        doc.setTextColor(...PDF_COLORS.light);
        doc.text("No website data available for this period.", 21, y + 2);
        y += 10;
      }

      // ──────── 2. SEO ────────
      y = ensureSpace(doc, y + 8, 60);
      y = renderSectionHeader(doc, "SEO Performance", y, PDF_COLORS.seo, latestSeo ? `Month: ${latestSeo.month}` : undefined);

      if (latestSeo) {
        autoTable(doc, {
          startY: y,
          head: [["Metric", "Current", "Previous", "Change"]],
          body: [
            ["Domain Authority", latestSeo.domain_authority.toString(), prevSeo?.domain_authority?.toString() || "—", prevSeo ? pctText(latestSeo.domain_authority, prevSeo.domain_authority) : "—"],
            ["Backlinks", latestSeo.backlinks.toLocaleString(), prevSeo?.backlinks?.toLocaleString() || "—", prevSeo ? pctText(latestSeo.backlinks, prevSeo.backlinks) : "—"],
            ["Keywords Top 10", latestSeo.keywords_top_10.toString(), prevSeo?.keywords_top_10?.toString() || "—", prevSeo ? pctText(latestSeo.keywords_top_10, prevSeo.keywords_top_10) : "—"],
            ["Organic Traffic", latestSeo.organic_traffic.toLocaleString(), prevSeo?.organic_traffic?.toLocaleString() || "—", prevSeo ? pctText(latestSeo.organic_traffic, prevSeo.organic_traffic) : "—"],
          ],
          ...getTableStyles(PDF_COLORS.seo),
          didParseCell: (data: any) => colorChangeCell(data, 3),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 40;

        const kws: SeoKeyword[] = latestSeo.top_keywords || [];
        if (kws.length > 0) {
          y = ensureSpace(doc, y + 6, 50);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.seo);
          doc.text("Top Keywords", 21, y);
          y += 4;
          autoTable(doc, {
            startY: y,
            head: [["#", "Keyword", "Position", "Change"]],
            body: kws.map((kw, i) => [(i + 1).toString(), kw.keyword, kw.position.toString(), kw.change]),
            ...getTableStyles(PDF_COLORS.seo),
            columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 90 } },
            didParseCell: (data: any) => colorChangeCell(data, 3),
          });
          y = (doc as any).lastAutoTable?.finalY || y + 30;
        }
      } else {
        doc.setFontSize(9);
        doc.setTextColor(...PDF_COLORS.light);
        doc.text("No SEO data available.", 21, y + 2);
        y += 10;
      }

      // ──────── 3. GOOGLE ADS ────────
      y = ensureSpace(doc, y + 8, 60);
      y = renderSectionHeader(doc, "Google Ads", y, PDF_COLORS.googleAds);

      if (adsData) {
        const m = adsData as any;
        const clicks = m.clicks || 0;
        const impressions = m.impressions || 0;
        const cost = m.cost || 0;
        const conversions = m.conversions || 0;
        const ctr = impressions > 0 ? `${(Math.round((clicks / impressions) * 10000) / 100)}%` : "0%";
        const cpc = clicks > 0 ? fmtCurrency(Math.round((cost / clicks) * 100) / 100) : "$0.00";

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: [
            ["Ad Spend", fmtCurrency(cost)],
            ["Clicks", clicks.toLocaleString()],
            ["Impressions", impressions.toLocaleString()],
            ["Conversions", Math.round(conversions).toLocaleString()],
            ["CTR", ctr],
            ["Avg. CPC", cpc],
          ],
          ...getTableStyles(PDF_COLORS.googleAds),
          columnStyles: { 1: { fontStyle: "bold" as const } },
        });
        y = (doc as any).lastAutoTable?.finalY || y + 40;

        const campaigns = (m.campaigns || []) as any[];
        if (campaigns.length > 0) {
          y = ensureSpace(doc, y + 6, 50);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.googleAds);
          doc.text("Campaign Performance", 21, y);
          y += 4;
          autoTable(doc, {
            startY: y,
            head: [["Campaign", "Spend", "Clicks", "Conv.", "CTR"]],
            body: campaigns.sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0)).slice(0, 10).map((c: any) => {
              const campCtr = c.impressions > 0 ? `${(Math.round((c.clicks / c.impressions) * 10000) / 100)}%` : "0%";
              return [c.name, fmtCurrency(c.cost || 0), (c.clicks || 0).toLocaleString(), Math.round(c.conversions || 0).toString(), campCtr];
            }),
            ...getTableStyles(PDF_COLORS.googleAds),
            columnStyles: { 0: { cellWidth: 60 } },
          });
          y = (doc as any).lastAutoTable?.finalY || y + 30;
        }
      } else {
        doc.setFontSize(9);
        doc.setTextColor(...PDF_COLORS.light);
        doc.text("No Google Ads data available.", 21, y + 2);
        y += 10;
      }

      // ──────── 4. SOCIAL MEDIA ────────
      y = ensureSpace(doc, y + 8, 60);
      y = renderSectionHeader(doc, "Social Media", y, PDF_COLORS.social);

      if (socialData.length > 0) {
        const platformStats: Record<string, Record<string, number>> = {};
        socialData.forEach((r: any) => {
          const p = r.platform || "unknown";
          if (!platformStats[p]) platformStats[p] = {};
          const mt = r.metric_type || "records";
          platformStats[p][mt] = (platformStats[p][mt] || 0) + (r.value || 1);
        });
        const body = Object.entries(platformStats).map(([platform, metrics]) => {
          const metricStr = Object.entries(metrics).map(([k, v]) => `${k}: ${v}`).join(", ");
          return [platform, metricStr];
        });
        autoTable(doc, {
          startY: y,
          head: [["Platform", "Metrics"]],
          body,
          ...getTableStyles(PDF_COLORS.social),
          columnStyles: { 0: { cellWidth: 40 } },
        });
      } else {
        doc.setFontSize(9);
        doc.setTextColor(...PDF_COLORS.light);
        doc.text("No social media data available.", 21, y + 2);
      }

      await finalizePDF(doc);
      doc.save(`${clinicName.replace(/\s+/g, "_")}_Unified_Report_${format(range.from, "yyyy-MM-dd")}.pdf`);
    } finally {
      setGenerating(false);
    }
  }, [hasAnyData, webMetrics, prevWebMetrics, latestSeo, prevSeo, adsData, socialData, clinicName, range]);

  if (!clinicId) {
    return <p className="text-muted-foreground text-sm text-center py-12">Select a clinic to generate a unified report.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Unified Performance Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Generate a combined PDF report covering Website, SEO, Google Ads, and Social Media performance for this clinic.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Report Period</label>
              <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(periodLabels) as [ReportPeriod, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generatePDF} disabled={loading || !hasAnyData || generating} className="gap-2">
              <Download className="h-4 w-4" />
              {generating ? "Generating…" : "Download Unified Report"}
            </Button>
          </div>
          {loading && <p className="text-xs text-muted-foreground mt-3">Loading data…</p>}
          {!loading && !hasAnyData && <p className="text-xs text-muted-foreground mt-3">No data available for any department.</p>}
        </CardContent>
      </Card>

      {!loading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Report Summary - {periodLabels[period]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <DeptStatus icon={Globe} label="Website" available={!!webMetrics} summary={webMetrics ? `${webMetrics.totalViews} views, ${webMetrics.totalSessions} visitors` : undefined} color="text-orange-500" />
              <DeptStatus icon={Search} label="SEO" available={!!latestSeo} summary={latestSeo ? `DA ${latestSeo.domain_authority}, ${latestSeo.organic_traffic} organic` : undefined} color="text-teal-500" />
              <DeptStatus icon={Megaphone} label="Google Ads" available={!!adsData} summary={adsData ? `${fmtCurrency(adsData.cost || 0)} spend, ${(adsData.clicks || 0).toLocaleString()} clicks` : undefined} color="text-blue-500" />
              <DeptStatus icon={Share2} label="Social Media" available={socialData.length > 0} summary={socialData.length > 0 ? `${socialData.length} data points` : undefined} color="text-purple-500" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DeptStatus({ icon: Icon, label, available, summary, color }: {
  icon: React.ElementType;
  label: string;
  available: boolean;
  summary?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
      <Icon className={`h-5 w-5 mx-auto mb-1.5 ${available ? color : "text-muted-foreground/40"}`} />
      <p className="text-xs font-semibold text-foreground">{label}</p>
      {available ? (
        <p className="text-[10px] text-muted-foreground mt-1">{summary}</p>
      ) : (
        <p className="text-[10px] text-muted-foreground/60 mt-1">No data</p>
      )}
      <div className={`h-1.5 w-1.5 rounded-full mx-auto mt-2 ${available ? "bg-success" : "bg-muted-foreground/20"}`} />
    </div>
  );
}
