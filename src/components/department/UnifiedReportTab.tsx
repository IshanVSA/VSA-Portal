import { useState, useEffect, useMemo, useCallback } from "react";
import { format, differenceInMilliseconds, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Download, Globe, Search, Megaphone, Share2, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { useGa4Compare } from "@/hooks/useGa4Compare";
import { useGa4Traffic } from "@/hooks/useGa4Traffic";
import { useSearchConsole } from "@/hooks/useSearchConsole";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PDF_COLORS, renderPDFHeader, renderSectionHeader,
  getTableStyles, colorChangeCell, finalizePDF, ensureSpace,
} from "@/lib/pdf-theme";
import {
  DEFAULT_CLINIC_TIMEZONE,
  getMonthDateRangeForTimeZone,
  getSafeTimeZone,
  getTrailingDateRangeForTimeZone,
} from "@/lib/website-analytics";
import { drawBarChart, drawLineChart, drawShareBar } from "@/lib/pdf-charts";

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
    case "last30": return getTrailingDateRangeForTimeZone(timeZone, 30);
    case "this_month": return getMonthDateRangeForTimeZone(timeZone);
    case "last_month": return getMonthDateRangeForTimeZone(timeZone, -1);
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
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtCurrency(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pctText(cur: number, prev: number): string {
  if (prev === 0 && cur === 0) return "No change";
  if (prev === 0) return `+${cur.toLocaleString()} (new)`;
  const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

interface WebsitePayload {
  timezone: string;
  kpi: {
    cur_sessions: number; prev_sessions: number;
    cur_engaged: number; prev_engaged: number;
    cur_avg_dur: number; prev_avg_dur: number;
    cur_views: number; prev_views: number;
  };
  daily: { date_key: string; views: number }[];
  hourly: { hour: number; views: number }[];
  top_pages: { path: string; views: number; visitors: number }[];
  session_depth: { one_page: number; two_three: number; four_plus: number; total: number };
  geo_total: number;
  geo: { country: string; visitors: number; top_regions: { name: string; count: number }[] }[];
}

async function fetchWebsitePayload(clinicId: string, from: Date, to: Date, tz: string): Promise<WebsitePayload | null> {
  const fromKey = format(from, "yyyy-MM-dd");
  const toKey = format(to, "yyyy-MM-dd");
  const fromIso = new Date(`${fromKey}T00:00:00Z`).toISOString();
  const toIso = new Date(`${toKey}T23:59:59Z`).toISOString();
  const { data, error } = await (supabase as any).rpc("get_website_analytics", {
    _clinic_id: clinicId, _from: fromIso, _to: toIso, _timezone: tz,
  });
  if (error) return null;
  return data as WebsitePayload;
}

function renderAnalysis(doc: any, y: number, accent: [number, number, number], text: string): number {
  y = ensureSpace(doc, y + 4, 30);
  doc.setFillColor(...accent);
  doc.roundedRect(14, y - 3, 3, 6, 1, 1, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.dark);
  doc.text("AI Performance Analysis", 21, y + 1);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_COLORS.medium);
  const clean = (text || "No analysis available.").replace(/\r/g, "");
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - 28;

  for (const para of paragraphs) {
    const lines: string[] = doc.splitTextToSize(para, maxWidth);
    for (const line of lines) {
      y = ensureSpace(doc, y, 8);
      doc.text(line, 14, y);
      y += 4.5;
    }
    y += 2;
  }
  return y + 2;
}

async function fetchAnalysis(
  department: string, clinicName: string, dateRange: string, metrics: any,
): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-report-analysis", {
      body: { department, clinicName, dateRange, metrics },
    });
    if (error) return "AI analysis unavailable for this section right now.";
    return (data as any)?.analysis || "No analysis returned.";
  } catch {
    return "AI analysis unavailable for this section right now.";
  }
}

export function UnifiedReportTab({ clinicId }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>("last30");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [clinicName, setClinicName] = useState("");
  const [timeZone, setTimeZone] = useState(DEFAULT_CLINIC_TIMEZONE);
  const [timezoneReady, setTimezoneReady] = useState(false);

  const [webCur, setWebCur] = useState<WebsitePayload | null>(null);
  const [webPrev, setWebPrev] = useState<WebsitePayload | null>(null);

  const [adsRaw, setAdsRaw] = useState<any>(null);

  const [fb, setFb] = useState<any>(null);
  const [ig, setIg] = useState<any>(null);

  const range = useMemo(() => getDateRange(period, timeZone), [period, timeZone]);
  const prevRange = useMemo(() => getPrevRange(range), [range]);

  const { data: ga4Cmp } = useGa4Compare(clinicId, range, "prev");
  const { data: ga4Traffic } = useGa4Traffic(clinicId, range);
  const { data: gsc } = useSearchConsole(clinicId, range, clinicName);
  const { data: prevGsc } = useSearchConsole(clinicId, prevRange, clinicName);

  const seoConnected = !!(gsc?.isConnected || ga4Cmp?.isConnected);
  const hasSeo = seoConnected && (
    (gsc?.totals?.clicks ?? 0) > 0 ||
    (gsc?.totals?.impressions ?? 0) > 0 ||
    (ga4Cmp?.current?.sessions ?? 0) > 0
  );

  useEffect(() => {
    if (!clinicId) { setLoading(false); setTimezoneReady(false); return; }
    (async () => {
      setLoading(true);
      setTimezoneReady(false);
      const { data } = await supabase.from("clinics").select("clinic_name, timezone").eq("id", clinicId).single();
      setClinicName(data?.clinic_name || "Unknown Clinic");
      setTimeZone(getSafeTimeZone(data?.timezone));
      setTimezoneReady(true);
    })();
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId || !timezoneReady) return;
    (async () => {
      setLoading(true);
      const [cur, prev, adsRow, socialRows] = await Promise.all([
        fetchWebsitePayload(clinicId, range.from, range.to, timeZone),
        fetchWebsitePayload(clinicId, prevRange.from, prevRange.to, timeZone),
        supabase.from("analytics").select("metrics_json").eq("clinic_id", clinicId)
          .eq("platform", "google_ads").eq("metric_type", "monthly_summary")
          .order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("analytics").select("platform, metrics_json, recorded_at")
          .eq("clinic_id", clinicId).in("platform", ["facebook", "instagram"])
          .order("recorded_at", { ascending: false }).limit(20),
      ]);
      setWebCur(cur);
      setWebPrev(prev);
      setAdsRaw(adsRow.data?.metrics_json ?? null);
      const rows = (socialRows.data || []) as any[];
      setFb(rows.find((r) => r.platform === "facebook")?.metrics_json ?? null);
      setIg(rows.find((r) => r.platform === "instagram")?.metrics_json ?? null);
      setLoading(false);
    })();
  }, [clinicId, prevRange, range, timeZone, timezoneReady]);

  const adsAgg = useMemo(() => {
    if (!adsRaw) return null;
    const fromISO = format(range.from, "yyyy-MM-dd");
    const toISO = format(range.to, "yyyy-MM-dd");
    const prevFromISO = format(prevRange.from, "yyyy-MM-dd");
    const prevToISO = format(prevRange.to, "yyyy-MM-dd");
    const trends: any[] = Array.isArray(adsRaw.daily_trends) ? adsRaw.daily_trends : [];
    const cur = trends.filter((t) => t.date >= fromISO && t.date <= toISO);
    const prev = trends.filter((t) => t.date >= prevFromISO && t.date <= prevToISO);
    const sum = (rows: any[]) => rows.reduce((a, t) => ({
      cost: a.cost + (+t.cost || 0),
      clicks: a.clicks + (+t.clicks || 0),
      impressions: a.impressions + (+t.impressions || 0),
      conversions: a.conversions + (+t.conversions || 0),
    }), { cost: 0, clicks: 0, impressions: 0, conversions: 0 });
    if (cur.length === 0) return null;
    return {
      current: sum(cur),
      previous: sum(prev),
      daily: cur.map((d: any) => ({
        date: d.date,
        clicks: +d.clicks || 0,
        impressions: +d.impressions || 0,
        cost: +d.cost || 0,
      })),
      campaigns: Array.isArray(adsRaw.campaigns) ? adsRaw.campaigns : [],
      searchTerms: (Array.isArray(adsRaw.search_terms) ? adsRaw.search_terms : [])
        .map((st: any) => {
          if (Array.isArray(st.daily) && st.daily.length > 0) {
            const days = st.daily.filter((d: any) => d.date >= fromISO && d.date <= toISO);
            return {
              term: st.term, keyword: st.keyword,
              clicks: days.reduce((a: number, d: any) => a + (+d.clicks || 0), 0),
              impressions: days.reduce((a: number, d: any) => a + (+d.impressions || 0), 0),
              cost: days.reduce((a: number, d: any) => a + (+d.cost || 0), 0),
              conversions: days.reduce((a: number, d: any) => a + (+d.conversions || 0), 0),
            };
          }
          return { term: st.term, keyword: st.keyword, clicks: +st.clicks || 0, impressions: +st.impressions || 0, cost: +st.cost || 0, conversions: +st.conversions || 0 };
        })
        .filter((st: any) => st.impressions > 0 || st.clicks > 0)
        .sort((a: any, b: any) => b.cost - a.cost || b.clicks - a.clicks)
        .slice(0, 20),
    };
  }, [adsRaw, range, prevRange]);

  const hasWeb = !!webCur && (webCur.kpi?.cur_views ?? 0) > 0;
  const hasAds = !!adsAgg;
  const hasSocial = !!(fb || ig);
  const hasAnyData = hasWeb || hasSeo || hasAds || hasSocial;

  const generatePDF = useCallback(async () => {
    if (!hasAnyData) return;
    setGenerating(true);
    try {
      const dateStr = `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`;

      // Build compact metric payloads for AI in parallel with PDF construction.
      const websiteMetricsForAI = hasWeb ? {
        current: webCur!.kpi,
        previous_totals: {
          views: webPrev?.kpi.cur_views ?? 0,
          sessions: webPrev?.kpi.cur_sessions ?? 0,
          engaged: webPrev?.kpi.cur_engaged ?? 0,
          avg_duration: webPrev?.kpi.cur_avg_dur ?? 0,
        },
        top_pages: webCur!.top_pages.slice(0, 10),
        session_depth: webCur!.session_depth,
        geo_top: webCur!.geo.slice(0, 5),
        daily_summary: {
          days: webCur!.daily.length,
          peak: [...webCur!.daily].sort((a, b) => b.views - a.views)[0] ?? null,
        },
      } : null;

      const seoMetricsForAI = hasSeo ? {
        organic_sessions: { current: ga4Cmp?.current?.sessions ?? 0, previous: ga4Cmp?.previous?.sessions ?? 0 },
        gsc_totals: gsc?.totals,
        prev_gsc_totals: prevGsc?.totals,
        top_queries: gsc?.topQueries?.slice(0, 10) ?? [],
        top_pages: gsc?.topPages?.slice(0, 10) ?? [],
        opportunity_queries: gsc?.opportunityQueries?.slice(0, 10) ?? [],
        brand_vs_non_brand: gsc?.brandVsNonBrand,
        devices: gsc?.devices ?? [],
        countries: gsc?.countries?.slice(0, 5) ?? [],
        channels: ga4Traffic?.channels?.slice(0, 8) ?? [],
      } : null;

      const adsMetricsForAI = hasAds ? {
        totals: adsAgg!.current,
        previous_totals: adsAgg!.previous,
        campaigns: adsAgg!.campaigns.slice(0, 10),
        search_terms: adsAgg!.searchTerms.slice(0, 10),
      } : null;

      const socialMetricsForAI = hasSocial ? {
        facebook: fb ? {
          followers: fb.followers, likes: fb.likes, reach: fb.reach, engagement: fb.engagement,
          page_views: fb.page_views, video_views: fb.video_views, fan_adds: fb.fan_adds,
          top_posts: (fb.recent_posts || []).slice(0, 5).map((p: any) => ({
            message: (p.message || "").slice(0, 140), likes: p.likes, comments: p.comments, shares: p.shares,
          })),
        } : null,
        instagram: ig ? {
          followers: ig.followers, media_count: ig.media_count, reach: ig.reach,
          engagement_rate: ig.engagement_rate, profile_views: ig.profile_views,
          website_clicks: ig.website_clicks, saves: ig.saves,
          top_media: (ig.recent_media || []).slice(0, 5).map((m: any) => ({
            caption: (m.caption || "").slice(0, 140), likes: m.likes, comments: m.comments, reach: m.reach,
          })),
        } : null,
      } : null;

      const [webAI, seoAI, adsAI, socialAI] = await Promise.all([
        websiteMetricsForAI ? fetchAnalysis("Website Analytics", clinicName, dateStr, websiteMetricsForAI) : Promise.resolve(""),
        seoMetricsForAI ? fetchAnalysis("SEO Performance", clinicName, dateStr, seoMetricsForAI) : Promise.resolve(""),
        adsMetricsForAI ? fetchAnalysis("Google Ads", clinicName, dateStr, adsMetricsForAI) : Promise.resolve(""),
        socialMetricsForAI ? fetchAnalysis("Social Media", clinicName, dateStr, socialMetricsForAI) : Promise.resolve(""),
      ]);

      const doc = new jsPDF();
      let y = renderPDFHeader(doc, "Unified Performance Report", clinicName, dateStr, PDF_COLORS.dark);

      // ═════════ WEBSITE ═════════
      y = renderSectionHeader(doc, "Website Analytics", y, PDF_COLORS.website);

      if (hasWeb) {
        const c = webCur!.kpi;
        const p = webPrev?.kpi ?? { cur_views: 0, cur_sessions: 0, cur_engaged: 0, cur_avg_dur: 0 } as any;
        const curPPS = c.cur_sessions > 0 ? Math.round((c.cur_views / c.cur_sessions) * 10) / 10 : 0;
        const prevPPS = (p.cur_sessions ?? 0) > 0 ? Math.round((p.cur_views / p.cur_sessions) * 10) / 10 : 0;
        const curEngRate = c.cur_sessions > 0 ? Math.round((c.cur_engaged / c.cur_sessions) * 1000) / 10 : 0;
        const prevEngRate = (p.cur_sessions ?? 0) > 0 ? Math.round(((p.cur_engaged ?? 0) / p.cur_sessions) * 1000) / 10 : 0;

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Current", "Previous", "Change"]],
          body: [
            ["Page Views", c.cur_views.toLocaleString(), (p.cur_views ?? 0).toLocaleString(), pctText(c.cur_views, p.cur_views ?? 0)],
            ["Unique Visitors", c.cur_sessions.toLocaleString(), (p.cur_sessions ?? 0).toLocaleString(), pctText(c.cur_sessions, p.cur_sessions ?? 0)],
            ["Engaged Sessions", c.cur_engaged.toLocaleString(), (p.cur_engaged ?? 0).toLocaleString(), pctText(c.cur_engaged, p.cur_engaged ?? 0)],
            ["Engagement Rate", `${curEngRate}%`, `${prevEngRate}%`, pctText(curEngRate, prevEngRate)],
            ["Avg. Session", formatDuration(c.cur_avg_dur), formatDuration(p.cur_avg_dur ?? 0), pctText(c.cur_avg_dur, p.cur_avg_dur ?? 0)],
            ["Pages / Session", curPPS.toString(), prevPPS.toString(), pctText(curPPS, prevPPS)],
          ],
          ...getTableStyles(PDF_COLORS.website),
          didParseCell: (d: any) => colorChangeCell(d, 3),
        });
        y = (doc as any).lastAutoTable.finalY + 6;

        // Daily page views trend chart
        if (webCur!.daily.length > 1) {
          y = drawLineChart(
            doc, y,
            webCur!.daily.map((d) => ({ label: format(new Date(d.date_key), "MMM d"), value: d.views })),
            { title: "Daily Page Views", color: PDF_COLORS.website, height: 55 },
          );
        }

        // Top pages
        if (webCur!.top_pages.length > 0) {
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.website); doc.text("Top Pages", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["#", "Page", "Views", "Visitors"]],
            body: webCur!.top_pages.slice(0, 12).map((p, i) => [
              (i + 1).toString(), p.path, p.views.toLocaleString(), p.visitors.toLocaleString(),
            ]),
            ...getTableStyles(PDF_COLORS.website),
            columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 110 } },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        // Session depth
        const sd = webCur!.session_depth;
        if (sd && sd.total > 0) {
          y = ensureSpace(doc, y, 30);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.website); doc.text("Pages / Session Mix", 21, y); y += 4;
          const pct = (n: number) => `${Math.round((n / sd.total) * 1000) / 10}%`;
          autoTable(doc, {
            startY: y,
            head: [["Bucket", "Sessions", "Share"]],
            body: [
              ["1 page", sd.one_page.toLocaleString(), pct(sd.one_page)],
              ["2–3 pages", sd.two_three.toLocaleString(), pct(sd.two_three)],
              ["4+ pages", sd.four_plus.toLocaleString(), pct(sd.four_plus)],
            ],
            ...getTableStyles(PDF_COLORS.website),
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        // Geography
        if (webCur!.geo_total > 0) {
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.website); doc.text("Visitor Geography", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["Country", "Top Regions", "Visitors", "Share"]],
            body: webCur!.geo.slice(0, 10).map((g) => {
              const share = webCur!.geo_total > 0 ? `${Math.round((g.visitors / webCur!.geo_total) * 1000) / 10}%` : "—";
              return [g.country, g.top_regions.map((r) => r.name).slice(0, 3).join(", "), g.visitors.toLocaleString(), share];
            }),
            ...getTableStyles(PDF_COLORS.website),
            columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 80 } },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        // Hourly traffic distribution
        if (webCur!.hourly.length > 0) {
          y = drawBarChart(
            doc, y,
            webCur!.hourly.map((h) => ({ label: `${String(h.hour).padStart(2, "0")}h`, value: h.views })),
            { title: `Traffic by Hour (${timeZone})`, color: PDF_COLORS.website, height: 50 },
          );
        }

        y = renderAnalysis(doc, y, PDF_COLORS.website, webAI);
      } else {
        doc.setFontSize(9); doc.setTextColor(...PDF_COLORS.light);
        doc.text("No website data available for this period.", 21, y + 2); y += 10;
      }

      // ═════════ SEO ═════════
      y = ensureSpace(doc, y + 6, 60);
      y = renderSectionHeader(doc, "SEO Performance", y, PDF_COLORS.seo);

      if (hasSeo) {
        const gscCur = gsc?.totals ?? { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0 };
        const gscPrev = prevGsc?.totals ?? { impressions: 0, clicks: 0, ctr: 0, avgPosition: 0 };
        const orgCur = ga4Cmp?.current?.sessions ?? 0;
        const orgPrev = ga4Cmp?.previous?.sessions ?? 0;

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Current", "Previous", "Change"]],
          body: [
            ["Organic Sessions", orgCur.toLocaleString(), orgPrev.toLocaleString(), pctText(orgCur, orgPrev)],
            ["Search Clicks", gscCur.clicks.toLocaleString(), gscPrev.clicks.toLocaleString(), pctText(gscCur.clicks, gscPrev.clicks)],
            ["Impressions", gscCur.impressions.toLocaleString(), gscPrev.impressions.toLocaleString(), pctText(gscCur.impressions, gscPrev.impressions)],
            ["CTR", `${(gscCur.ctr * 100).toFixed(2)}%`, `${(gscPrev.ctr * 100).toFixed(2)}%`, pctText(gscCur.ctr, gscPrev.ctr)],
            ["Avg. Position", gscCur.avgPosition > 0 ? gscCur.avgPosition.toFixed(1) : "—", gscPrev.avgPosition > 0 ? gscPrev.avgPosition.toFixed(1) : "—", "—"],
          ],
          ...getTableStyles(PDF_COLORS.seo),
          didParseCell: (d: any) => colorChangeCell(d, 3),
        });
        y = (doc as any).lastAutoTable.finalY + 6;

        // Channels (GA4)
        if ((ga4Traffic?.channels || []).length > 0) {
          y = drawBarChart(
            doc, y,
            ga4Traffic!.channels.slice(0, 8).map((c) => ({ label: c.channel, value: c.sessions })),
            { title: "Sessions by Channel (GA4)", color: PDF_COLORS.seo, height: 55 },
          );
          autoTable(doc, {
            startY: y,
            head: [["Channel", "Sessions", "Engaged", "Engagement Rate", "Avg. Time"]],
            body: ga4Traffic!.channels.slice(0, 10).map((c) => [
              c.channel,
              c.sessions.toLocaleString(),
              c.engagedSessions.toLocaleString(),
              `${(c.engagementRate * 100).toFixed(1)}%`,
              formatDuration(c.avgEngagementTimeSeconds),
            ]),
            ...getTableStyles(PDF_COLORS.seo),
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        if ((gsc?.topQueries || []).length > 0) {
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.seo); doc.text("Top Queries", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["#", "Query", "Clicks", "Impr.", "CTR", "Pos."]],
            body: gsc!.topQueries.slice(0, 15).map((q, i) => [
              (i + 1).toString(), q.query, q.clicks.toLocaleString(),
              q.impressions.toLocaleString(), `${(q.ctr * 100).toFixed(1)}%`, q.position.toFixed(1),
            ]),
            ...getTableStyles(PDF_COLORS.seo),
            columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 80 } },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        if ((gsc?.topPages || []).length > 0) {
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.seo); doc.text("Top Pages", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["#", "Page", "Clicks", "Impr.", "CTR"]],
            body: gsc!.topPages.slice(0, 12).map((p, i) => {
              const path = p.page.replace(/^https?:\/\/[^/]+/, "") || "/";
              return [(i + 1).toString(), path, p.clicks.toLocaleString(), p.impressions.toLocaleString(), `${(p.ctr * 100).toFixed(1)}%`];
            }),
            ...getTableStyles(PDF_COLORS.seo),
            columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 100 } },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        if ((gsc?.opportunityQueries || []).length > 0) {
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.seo); doc.text("Growth Opportunities (Pos. 11–20)", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["Query", "Impressions", "Position"]],
            body: gsc!.opportunityQueries.map((q) => [q.query, q.impressions.toLocaleString(), q.position.toFixed(1)]),
            ...getTableStyles(PDF_COLORS.seo),
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        const bnb = gsc?.brandVsNonBrand;
        if (bnb && (bnb.brand + bnb.nonBrand) > 0) {
          y = drawShareBar(
            doc, y,
            [
              { label: "Branded", value: bnb.brand, color: PDF_COLORS.seo },
              { label: "Non-Branded", value: bnb.nonBrand, color: PDF_COLORS.googleAds },
            ],
            { title: "Brand vs Non-Brand Clicks" },
          );
        }

        if ((gsc?.devices || []).length > 0) {
          y = ensureSpace(doc, y, 30);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.seo); doc.text("Device Performance", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["Device", "Clicks", "Impressions"]],
            body: gsc!.devices.map((d) => [d.device, d.clicks.toLocaleString(), d.impressions.toLocaleString()]),
            ...getTableStyles(PDF_COLORS.seo),
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        if ((gsc?.countries || []).length > 0) {
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.seo); doc.text("Top Countries", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["Country", "Clicks", "Impressions"]],
            body: gsc!.countries.slice(0, 10).map((c) => [c.country, c.clicks.toLocaleString(), c.impressions.toLocaleString()]),
            ...getTableStyles(PDF_COLORS.seo),
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        y = renderAnalysis(doc, y, PDF_COLORS.seo, seoAI);
      } else {
        doc.setFontSize(9); doc.setTextColor(...PDF_COLORS.light);
        doc.text("No SEO data available. Connect Google Analytics and Search Console in the SEO department.", 21, y + 2);
        y += 10;
      }

      // ═════════ GOOGLE ADS ═════════
      y = ensureSpace(doc, y + 6, 60);
      y = renderSectionHeader(doc, "Google Ads", y, PDF_COLORS.googleAds);

      if (hasAds) {
        const cur = adsAgg!.current;
        const prev = adsAgg!.previous;
        const ctr = cur.impressions > 0 ? Math.round((cur.clicks / cur.impressions) * 10000) / 100 : 0;
        const cpc = cur.clicks > 0 ? Math.round((cur.cost / cur.clicks) * 100) / 100 : 0;
        const prevCtr = prev.impressions > 0 ? Math.round((prev.clicks / prev.impressions) * 10000) / 100 : 0;
        const prevCpc = prev.clicks > 0 ? Math.round((prev.cost / prev.clicks) * 100) / 100 : 0;
        autoTable(doc, {
          startY: y,
          head: [["Metric", "Current", "Previous", "Change"]],
          body: [
            ["Ad Spend", fmtCurrency(cur.cost), fmtCurrency(prev.cost), pctText(cur.cost, prev.cost)],
            ["Clicks", cur.clicks.toLocaleString(), prev.clicks.toLocaleString(), pctText(cur.clicks, prev.clicks)],
            ["Impressions", cur.impressions.toLocaleString(), prev.impressions.toLocaleString(), pctText(cur.impressions, prev.impressions)],
            ["Conversions", Math.round(cur.conversions).toLocaleString(), Math.round(prev.conversions).toLocaleString(), pctText(cur.conversions, prev.conversions)],
            ["CTR", `${ctr}%`, `${prevCtr}%`, pctText(ctr, prevCtr)],
            ["Avg. CPC", fmtCurrency(cpc), fmtCurrency(prevCpc), pctText(cpc, prevCpc)],
          ],
          ...getTableStyles(PDF_COLORS.googleAds),
          didParseCell: (d: any) => colorChangeCell(d, 3),
        });
        y = (doc as any).lastAutoTable.finalY + 6;

        // Daily clicks & spend trend
        if (adsAgg!.daily.length > 1) {
          y = drawLineChart(
            doc, y,
            adsAgg!.daily.map((d) => ({ label: format(new Date(d.date), "MMM d"), value: d.clicks })),
            { title: "Daily Clicks", color: PDF_COLORS.googleAds, height: 50 },
          );
          y = drawLineChart(
            doc, y,
            adsAgg!.daily.map((d) => ({ label: format(new Date(d.date), "MMM d"), value: d.cost })),
            { title: "Daily Ad Spend", color: PDF_COLORS.googleAds, height: 50, valueFormatter: fmtCurrency },
          );
        }

        if (adsAgg!.campaigns.length > 0) {
          const topCampaigns = [...adsAgg!.campaigns].sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0)).slice(0, 8);
          y = drawBarChart(
            doc, y,
            topCampaigns.map((c: any) => ({ label: c.name, value: +c.cost || 0 })),
            { title: "Top Campaigns by Spend", color: PDF_COLORS.googleAds, height: 55, valueFormatter: fmtCurrency },
          );
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.googleAds); doc.text("Campaign Performance", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["Campaign", "Spend", "Clicks", "Impr.", "CTR", "CPC"]],
            body: [...adsAgg!.campaigns].sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0)).slice(0, 12).map((c: any) => {
              const cCtr = c.impressions > 0 ? `${(Math.round((c.clicks / c.impressions) * 10000) / 100)}%` : "0%";
              const cCpc = c.clicks > 0 ? fmtCurrency(Math.round((c.cost / c.clicks) * 100) / 100) : "$0.00";
              return [c.name, fmtCurrency(c.cost || 0), (c.clicks || 0).toLocaleString(), (c.impressions || 0).toLocaleString(), cCtr, cCpc];
            }),
            ...getTableStyles(PDF_COLORS.googleAds),
            columnStyles: { 0: { cellWidth: 60 } },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        if (adsAgg!.searchTerms.length > 0) {
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.googleAds); doc.text("Top Search Terms", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["#", "Search Term", "Matched Keyword", "Clicks", "Impr.", "Cost"]],
            body: adsAgg!.searchTerms.slice(0, 15).map((s: any, i: number) => [
              (i + 1).toString(), s.term, s.keyword || "—",
              s.clicks.toLocaleString(), s.impressions.toLocaleString(), fmtCurrency(s.cost),
            ]),
            ...getTableStyles(PDF_COLORS.googleAds),
            columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 60 }, 2: { cellWidth: 45 } },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }

        y = renderAnalysis(doc, y, PDF_COLORS.googleAds, adsAI);
      } else {
        doc.setFontSize(9); doc.setTextColor(...PDF_COLORS.light);
        doc.text("No Google Ads data available.", 21, y + 2); y += 10;
      }

      // ═════════ SOCIAL MEDIA ═════════
      y = ensureSpace(doc, y + 6, 60);
      y = renderSectionHeader(doc, "Social Media", y, PDF_COLORS.social);

      if (hasSocial) {
        if (fb) {
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.social); doc.text("Facebook", 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["Metric", "Value"]],
            body: [
              ["Page Likes", (fb.likes ?? 0).toLocaleString()],
              ["Followers", (fb.followers ?? 0).toLocaleString()],
              ["Reach (28d)", (fb.reach ?? 0).toLocaleString()],
              ["Engagement (28d)", (fb.engagement ?? 0).toLocaleString()],
              ["Page Views", (fb.page_views ?? 0).toLocaleString()],
              ["Video Views", (fb.video_views ?? 0).toLocaleString()],
              ["New Fans", (fb.fan_adds ?? 0).toLocaleString()],
              ["Post Engagements", (fb.post_engagements ?? 0).toLocaleString()],
            ],
            ...getTableStyles(PDF_COLORS.social),
          });
          y = (doc as any).lastAutoTable.finalY + 6;

          y = drawBarChart(
            doc, y,
            [
              { label: "Reach", value: fb.reach ?? 0 },
              { label: "Engagement", value: fb.engagement ?? 0 },
              { label: "Page Views", value: fb.page_views ?? 0 },
              { label: "Video Views", value: fb.video_views ?? 0 },
              { label: "New Fans", value: fb.fan_adds ?? 0 },
            ],
            { title: "Facebook · 28-Day Activity", color: PDF_COLORS.social, height: 55 },
          );

          if (Array.isArray(fb.recent_posts) && fb.recent_posts.length > 0) {
            y = ensureSpace(doc, y, 40);
            doc.setFontSize(10); doc.setFont("helvetica", "bold");
            doc.setTextColor(...PDF_COLORS.social); doc.text("Facebook · Recent Posts", 21, y); y += 4;
            autoTable(doc, {
              startY: y,
              head: [["Date", "Caption", "Likes", "Comments", "Shares"]],
              body: fb.recent_posts.slice(0, 8).map((p: any) => [
                p.created_time ? format(new Date(p.created_time), "MMM d") : "—",
                (p.message || "—").slice(0, 90),
                (p.likes ?? 0).toLocaleString(),
                (p.comments ?? 0).toLocaleString(),
                (p.shares ?? 0).toLocaleString(),
              ]),
              ...getTableStyles(PDF_COLORS.social),
              columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 90 } },
            });
            y = (doc as any).lastAutoTable.finalY + 6;
          }
        }

        if (ig) {
          y = ensureSpace(doc, y, 40);
          doc.setFontSize(10); doc.setFont("helvetica", "bold");
          doc.setTextColor(...PDF_COLORS.social); doc.text(`Instagram${ig.username ? ` · @${ig.username}` : ""}`, 21, y); y += 4;
          autoTable(doc, {
            startY: y,
            head: [["Metric", "Value"]],
            body: [
              ["Followers", (ig.followers ?? 0).toLocaleString()],
              ["Posts", (ig.media_count ?? 0).toLocaleString()],
              ["Reach", (ig.reach ?? 0).toLocaleString()],
              ["Engagement Rate", `${ig.engagement_rate ?? 0}%`],
              ["Profile Views", (ig.profile_views ?? 0).toLocaleString()],
              ["Website Clicks", (ig.website_clicks ?? 0).toLocaleString()],
              ["Total Interactions", (ig.total_interactions ?? 0).toLocaleString()],
              ["Saves", (ig.saves ?? 0).toLocaleString()],
            ],
            ...getTableStyles(PDF_COLORS.social),
          });
          y = (doc as any).lastAutoTable.finalY + 6;

          if (Array.isArray(ig.recent_media) && ig.recent_media.length > 0) {
            y = ensureSpace(doc, y, 40);
            doc.setFontSize(10); doc.setFont("helvetica", "bold");
            doc.setTextColor(...PDF_COLORS.social); doc.text("Instagram · Recent Posts", 21, y); y += 4;
            autoTable(doc, {
              startY: y,
              head: [["Caption", "Likes", "Comments", "Reach"]],
              body: ig.recent_media.slice(0, 8).map((m: any) => [
                (m.caption || "—").slice(0, 100),
                (m.likes ?? 0).toLocaleString(),
                (m.comments ?? 0).toLocaleString(),
                (m.reach ?? 0).toLocaleString(),
              ]),
              ...getTableStyles(PDF_COLORS.social),
              columnStyles: { 0: { cellWidth: 110 } },
            });
            y = (doc as any).lastAutoTable.finalY + 6;
          }
        }

        y = renderAnalysis(doc, y, PDF_COLORS.social, socialAI);
      } else {
        doc.setFontSize(9); doc.setTextColor(...PDF_COLORS.light);
        doc.text("No social media data available.", 21, y + 2);
      }

      await finalizePDF(doc);
      doc.save(`${clinicName.replace(/\s+/g, "_")}_Unified_Report_${format(range.from, "yyyy-MM-dd")}.pdf`);
      toast.success("Report ready");
    } catch (e: any) {
      console.error("PDF generation failed", e);
      toast.error(e?.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }, [hasAnyData, hasWeb, hasSeo, hasAds, hasSocial, webCur, webPrev, ga4Cmp, ga4Traffic, gsc, prevGsc, adsAgg, fb, ig, clinicName, range, timeZone]);

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
            Generate a detailed PDF covering Website, SEO, Google Ads and Social Media, with the same metrics
            shown in each department's analytics tab plus an AI-generated performance analysis for each section.
          </p>
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
            <Button onClick={generatePDF} disabled={loading || !hasAnyData || generating} className="gap-2">
              <Download className="h-4 w-4" />
              {generating ? "Generating…" : "Download Detailed Report"}
            </Button>
          </div>
          {loading && <p className="text-xs text-muted-foreground mt-3">Loading data…</p>}
          {generating && <p className="text-xs text-muted-foreground mt-3">Building tables and generating AI analyses. This can take 15–30 seconds…</p>}
          {!loading && !hasAnyData && <p className="text-xs text-muted-foreground mt-3">No data available for any department.</p>}
        </CardContent>
      </Card>

      {!loading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Report Summary · {periodLabels[period]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <DeptStatus
                icon={Globe}
                label="Website"
                available={hasWeb}
                summary={hasWeb ? `${(webCur!.kpi.cur_views).toLocaleString()} views · ${(webCur!.kpi.cur_sessions).toLocaleString()} visitors` : undefined}
                color="text-orange-500"
              />
              <DeptStatus
                icon={Search}
                label="SEO"
                available={hasSeo}
                summary={hasSeo ? `${(gsc?.totals?.clicks ?? 0).toLocaleString()} clicks · ${(ga4Cmp?.current?.sessions ?? 0).toLocaleString()} organic sessions` : undefined}
                color="text-teal-500"
              />
              <DeptStatus
                icon={Megaphone}
                label="Google Ads"
                available={hasAds}
                summary={hasAds ? `${fmtCurrency(adsAgg!.current.cost)} spend · ${adsAgg!.current.clicks.toLocaleString()} clicks` : undefined}
                color="text-blue-500"
              />
              <DeptStatus
                icon={Share2}
                label="Social Media"
                available={hasSocial}
                summary={hasSocial ? `${((fb?.followers ?? 0) + (ig?.followers ?? 0)).toLocaleString()} total followers` : undefined}
                color="text-purple-500"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DeptStatus({ icon: Icon, label, available, summary, color }: {
  icon: React.ElementType; label: string; available: boolean; summary?: string; color: string;
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
