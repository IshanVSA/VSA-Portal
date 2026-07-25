import { useState, useEffect, useMemo, useCallback } from "react";
import { format, differenceInMilliseconds } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Printer, Globe, Search, Megaphone, Share2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useGa4Compare } from "@/hooks/useGa4Compare";
import { useGa4Traffic } from "@/hooks/useGa4Traffic";
import { useSearchConsole } from "@/hooks/useSearchConsole";
import {
  DEFAULT_CLINIC_TIMEZONE,
  getMonthDateRangeForTimeZone,
  getSafeTimeZone,
  getTrailingDateRangeForTimeZone,
} from "@/lib/website-analytics";
import { buildUnifiedReportHTML, printReportHTML, type UnifiedReportData } from "@/lib/unified-report-html";

interface Props { clinicId: string; }

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

async function fetchAnalysis(department: string, clinicName: string, dateRange: string, metrics: any): Promise<string> {
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

function fmtCurrency(v: number) { return `$${(v??0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`; }

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
      setLoading(true); setTimezoneReady(false);
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
      setWebCur(cur); setWebPrev(prev);
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
      daily: cur.map((d: any) => ({ date: d.date, clicks: +d.clicks || 0, cost: +d.cost || 0 })),
      campaigns: (Array.isArray(adsRaw.campaigns) ? adsRaw.campaigns : []).map((c: any) => ({
        name: c.name, cost: +c.cost || 0, clicks: +c.clicks || 0, impressions: +c.impressions || 0,
      })),
    };
  }, [adsRaw, range, prevRange]);

  const hasWeb = !!webCur && (webCur.kpi?.cur_views ?? 0) > 0;
  const hasAds = !!adsAgg;
  const hasSocial = !!(fb || ig);
  const hasAnyData = hasWeb || hasSeo || hasAds || hasSocial;

  const generateReport = useCallback(async () => {
    if (!hasAnyData) return;
    setGenerating(true);
    try {
      const dateStr = `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`;

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
      } : null;

      const seoMetricsForAI = hasSeo ? {
        organic_sessions: { current: ga4Cmp?.current?.sessions ?? 0, previous: ga4Cmp?.previous?.sessions ?? 0 },
        gsc_totals: gsc?.totals,
        prev_gsc_totals: prevGsc?.totals,
        top_queries: gsc?.topQueries?.slice(0, 10) ?? [],
        top_pages: gsc?.topPages?.slice(0, 10) ?? [],
        brand_vs_non_brand: gsc?.brandVsNonBrand,
        devices: gsc?.devices ?? [],
        countries: gsc?.countries?.slice(0, 5) ?? [],
        channels: ga4Traffic?.channels?.slice(0, 8) ?? [],
      } : null;

      const adsMetricsForAI = hasAds ? {
        totals: adsAgg!.current, previous_totals: adsAgg!.previous,
        campaigns: adsAgg!.campaigns.slice(0, 10),
      } : null;

      const socialMetricsForAI = hasSocial ? {
        facebook: fb ? { followers: fb.followers, likes: fb.likes, reach: fb.reach, engagement: fb.engagement, page_views: fb.page_views, video_views: fb.video_views, fan_adds: fb.fan_adds } : null,
        instagram: ig ? { followers: ig.followers, media_count: ig.media_count, reach: ig.reach, engagement_rate: ig.engagement_rate, profile_views: ig.profile_views, website_clicks: ig.website_clicks, saves: ig.saves } : null,
      } : null;

      const [webAI, seoAI, adsAI, socialAI] = await Promise.all([
        websiteMetricsForAI ? fetchAnalysis("Website Analytics", clinicName, dateStr, websiteMetricsForAI) : Promise.resolve(""),
        seoMetricsForAI ? fetchAnalysis("SEO Performance", clinicName, dateStr, seoMetricsForAI) : Promise.resolve(""),
        adsMetricsForAI ? fetchAnalysis("Google Ads", clinicName, dateStr, adsMetricsForAI) : Promise.resolve(""),
        socialMetricsForAI ? fetchAnalysis("Social Media", clinicName, dateStr, socialMetricsForAI) : Promise.resolve(""),
      ]);

      const data: UnifiedReportData = {
        clinicName,
        periodLabel: dateStr,
        timezone: timeZone,
        website: hasWeb ? {
          kpi: (() => {
            const c = webCur!.kpi;
            const p = webPrev?.kpi ?? { cur_views:0, cur_sessions:0, cur_engaged:0, cur_avg_dur:0 } as any;
            return {
              views: { cur: c.cur_views, prev: p.cur_views ?? 0 },
              visitors: { cur: c.cur_sessions, prev: p.cur_sessions ?? 0 },
              engaged: { cur: c.cur_engaged, prev: p.cur_engaged ?? 0 },
              engagementRate: {
                cur: c.cur_sessions > 0 ? c.cur_engaged / c.cur_sessions : 0,
                prev: (p.cur_sessions ?? 0) > 0 ? (p.cur_engaged ?? 0) / p.cur_sessions : 0,
              },
              avgSessionSec: { cur: c.cur_avg_dur, prev: p.cur_avg_dur ?? 0 },
              pagesPerSession: {
                cur: c.cur_sessions > 0 ? c.cur_views / c.cur_sessions : 0,
                prev: (p.cur_sessions ?? 0) > 0 ? (p.cur_views ?? 0) / p.cur_sessions : 0,
              },
            };
          })(),
          daily: webCur!.daily.map(d => ({ date: d.date_key, views: d.views })),
          hourly: webCur!.hourly,
          topPages: webCur!.top_pages,
          sessionDepth: webCur!.session_depth,
          geoTotal: webCur!.geo_total,
          geo: webCur!.geo.map(g => ({ country: g.country, visitors: g.visitors, regions: g.top_regions.map(r => r.name) })),
          aiAnalysis: webAI,
        } : undefined,
        seo: hasSeo ? {
          kpi: {
            organicSessions: { cur: ga4Cmp?.current?.sessions ?? 0, prev: ga4Cmp?.previous?.sessions ?? 0 },
            clicks: { cur: gsc?.totals?.clicks ?? 0, prev: prevGsc?.totals?.clicks ?? 0 },
            impressions: { cur: gsc?.totals?.impressions ?? 0, prev: prevGsc?.totals?.impressions ?? 0 },
            ctr: { cur: gsc?.totals?.ctr ?? 0, prev: prevGsc?.totals?.ctr ?? 0 },
            avgPosition: { cur: gsc?.totals?.avgPosition ?? 0, prev: prevGsc?.totals?.avgPosition ?? 0 },
          },
          channels: (ga4Traffic?.channels ?? []).map(c => ({ channel: c.channel, sessions: c.sessions })),
          brandVsNonBrand: gsc?.brandVsNonBrand,
          devices: gsc?.devices ?? [],
          countries: gsc?.countries ?? [],
          topQueries: gsc?.topQueries ?? [],
          topPages: gsc?.topPages ?? [],
          aiAnalysis: seoAI,
        } : undefined,
        ads: hasAds ? {
          kpi: (() => {
            const c = adsAgg!.current, p = adsAgg!.previous;
            return {
              spend: { cur: c.cost, prev: p.cost },
              clicks: { cur: c.clicks, prev: p.clicks },
              impressions: { cur: c.impressions, prev: p.impressions },
              conversions: { cur: c.conversions, prev: p.conversions },
              ctr: { cur: c.impressions>0 ? c.clicks/c.impressions : 0, prev: p.impressions>0 ? p.clicks/p.impressions : 0 },
              cpc: { cur: c.clicks>0 ? c.cost/c.clicks : 0, prev: p.clicks>0 ? p.cost/p.clicks : 0 },
            };
          })(),
          daily: adsAgg!.daily,
          campaigns: adsAgg!.campaigns,
          aiAnalysis: adsAI,
        } : undefined,
        social: hasSocial ? {
          facebook: fb ? {
            likes: fb.likes ?? 0, followers: fb.followers ?? 0, reach: fb.reach ?? 0,
            engagement: fb.engagement ?? 0, page_views: fb.page_views ?? 0,
            video_views: fb.video_views ?? 0, fan_adds: fb.fan_adds ?? 0,
          } : undefined,
          instagram: ig ? {
            username: ig.username, followers: ig.followers ?? 0, media_count: ig.media_count ?? 0,
            reach: ig.reach ?? 0, engagement_rate: ig.engagement_rate ?? 0,
            profile_views: ig.profile_views ?? 0, website_clicks: ig.website_clicks ?? 0,
            saves: ig.saves ?? 0, total_interactions: ig.total_interactions ?? 0,
          } : undefined,
          aiAnalysis: socialAI,
        } : undefined,
      };

      const html = await buildUnifiedReportHTML(data);
      printReportHTML(html);
      toast.success("Report ready. Use the print dialog to save as PDF.");
    } catch (e: any) {
      console.error("Report generation failed", e);
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
            Generates a fully-designed HTML report covering Website, SEO, Google Ads and Social Media —
            with KPI cards, charts, and an AI-generated performance analysis per section. When the print
            dialog opens, choose <b>Save as PDF</b> to download.
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
            <Button onClick={generateReport} disabled={loading || !hasAnyData || generating} className="gap-2">
              <Printer className="h-4 w-4" />
              {generating ? "Generating…" : "Generate Report"}
            </Button>
          </div>
          {loading && <p className="text-xs text-muted-foreground mt-3">Loading data…</p>}
          {generating && <p className="text-xs text-muted-foreground mt-3">Building report and generating AI analyses. This can take 15–30 seconds…</p>}
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
              <DeptStatus icon={Globe} label="Website" available={hasWeb}
                summary={hasWeb ? `${(webCur!.kpi.cur_views).toLocaleString()} views · ${(webCur!.kpi.cur_sessions).toLocaleString()} visitors` : undefined}
                color="text-orange-500" />
              <DeptStatus icon={Search} label="SEO" available={hasSeo}
                summary={hasSeo ? `${(gsc?.totals?.clicks ?? 0).toLocaleString()} clicks · ${(ga4Cmp?.current?.sessions ?? 0).toLocaleString()} organic sessions` : undefined}
                color="text-teal-500" />
              <DeptStatus icon={Megaphone} label="Google Ads" available={hasAds}
                summary={hasAds ? `${fmtCurrency(adsAgg!.current.cost)} spend · ${adsAgg!.current.clicks.toLocaleString()} clicks` : undefined}
                color="text-blue-500" />
              <DeptStatus icon={Share2} label="Social Media" available={hasSocial}
                summary={hasSocial ? `${((fb?.followers ?? 0) + (ig?.followers ?? 0)).toLocaleString()} total followers` : undefined}
                color="text-purple-500" />
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
