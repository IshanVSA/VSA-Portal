import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Globe, Link2, Hash, TrendingUp, BarChart3 } from "lucide-react";
import { useSeoAnalytics, type SeoKeyword, type SeoExtendedData } from "@/hooks/useSeoAnalytics";
import { useGa4Traffic } from "@/hooks/useGa4Traffic";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PDF_COLORS, renderPDFHeader, renderSectionHeader, renderKPICards,
  getTableStyles, colorChangeCell, finalizePDF, ensureSpace,
} from "@/lib/pdf-theme";

interface Props {
  clinicId: string;
}

export function SeoReportsTab({ clinicId }: Props) {
  const { rows, isLoading } = useSeoAnalytics(clinicId);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  // Always offer the last 24 months as selectable options, regardless of stored SEO rows
  const months = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, []);
  const activeMonth = selectedMonth || months[0] || "";
  const current = useMemo(() => rows.find(r => r.month === activeMonth) || null, [rows, activeMonth]);
  const sortedDataMonths = useMemo(() => rows.map(r => r.month).sort().reverse(), [rows]);
  const prevMonth = useMemo(() => {
    if (!activeMonth || sortedDataMonths.length < 2) return null;
    const idx = sortedDataMonths.indexOf(activeMonth);
    if (idx === -1) return rows.find(r => r.month === sortedDataMonths[0]) || null;
    return idx < sortedDataMonths.length - 1 ? rows.find(r => r.month === sortedDataMonths[idx + 1]) || null : null;
  }, [rows, sortedDataMonths, activeMonth]);

  // GA4 traffic for the selected month
  const monthRange = useMemo(() => {
    if (!activeMonth) return null;
    const [yStr, mStr] = activeMonth.split("-");
    const yr = Number(yStr), mo = Number(mStr) - 1;
    if (!isFinite(yr) || !isFinite(mo)) return null;
    const from = new Date(yr, mo, 1);
    const to = new Date(yr, mo + 1, 0);
    return { from, to };
  }, [activeMonth]);
  const { data: ga4 } = useGa4Traffic(clinicId, monthRange || { from: new Date(), to: new Date() });
  const { data: ctaData } = useGa4Cta(clinicId, monthRange || { from: new Date(), to: new Date() });


  const [clinicName, setClinicName] = useState("");
  useMemo(() => {
    if (!clinicId) return;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase.from("clinics").select("clinic_name").eq("id", clinicId).single().then(({ data }) => {
        setClinicName(data?.clinic_name || "Unknown Clinic");
      });
    });
  }, [clinicId]);

  function pctChange(cur: number, prev: number | undefined, invertBetter = false) {
    if (prev === undefined || prev === null) return { text: "—", color: "text-muted-foreground" };
    if (prev === 0 && cur === 0) return { text: "No change", color: "text-muted-foreground" };
    if (prev === 0) return { text: `+${cur} (new)`, color: invertBetter ? "text-destructive" : "text-success" };
    const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
    const sign = pct >= 0 ? "+" : "";
    let color = pct > 0 ? "text-success" : pct < 0 ? "text-destructive" : "text-muted-foreground";
    if (invertBetter) color = pct > 0 ? "text-destructive" : pct < 0 ? "text-success" : "text-muted-foreground";
    return { text: `${sign}${pct}%`, color };
  }

  function pctText(cur: number, prev: number): string {
    if (prev === 0 && cur === 0) return "No change";
    if (prev === 0) return `+${cur} (new)`;
    const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
    return `${pct >= 0 ? "+" : ""}${pct}%`;
  }

  const generatePDF = useCallback(async () => {
    if (!activeMonth) return;
    setGenerating(true);
    try {
      const doc = new jsPDF();
      const ext: SeoExtendedData = current?.extended_data || {};

      // ── Header ──
      const subtitle = ext.report_period
        ? `Report Period: ${ext.report_period}`
        : current && prevMonth ? `Month: ${current.month} vs ${prevMonth.month}` : `Month: ${activeMonth}`;
      let y = renderPDFHeader(doc, "SEO Performance Report", clinicName, subtitle, PDF_COLORS.seo);

      // Website URL
      if (ext.website_url) {
        doc.setFontSize(8);
        doc.setTextColor(...PDF_COLORS.light);
        doc.text(`Website: ${ext.website_url}`, 14, y - 4);
        y += 2;
      }

      if (current) {
      // ── Primary KPI Cards ──
      y = renderKPICards(doc, y, [
        { label: "Domain Authority", value: current.domain_authority.toString(), change: prevMonth ? pctText(current.domain_authority, prevMonth.domain_authority) : undefined },
        { label: "Backlinks", value: current.backlinks.toLocaleString(), change: prevMonth ? pctText(current.backlinks, prevMonth.backlinks) : undefined },
        { label: "Keywords Top 10", value: current.keywords_top_10.toString(), change: prevMonth ? pctText(current.keywords_top_10, prevMonth.keywords_top_10) : undefined },
        { label: "Organic Traffic", value: current.organic_traffic.toLocaleString(), change: prevMonth ? pctText(current.organic_traffic, prevMonth.organic_traffic) : undefined },
      ], PDF_COLORS.seo);

      // ── Secondary Metrics ──
      const secondaryMetrics: string[][] = [];
      if (ext.avg_position) secondaryMetrics.push(["Average Position", ext.avg_position.toFixed(1)]);
      if (ext.bounce_rate) secondaryMetrics.push(["Bounce Rate", `${ext.bounce_rate}%`]);
      if (ext.avg_session_duration) secondaryMetrics.push(["Avg Session Duration", ext.avg_session_duration]);
      if (ext.pages_per_session) secondaryMetrics.push(["Pages per Session", ext.pages_per_session.toString()]);
      if (ext.total_keywords_tracked) secondaryMetrics.push(["Total Keywords Tracked", ext.total_keywords_tracked.toString()]);
      if (ext.referring_domains) secondaryMetrics.push(["Referring Domains", ext.referring_domains.toString()]);
      if (ext.indexed_pages) secondaryMetrics.push(["Indexed Pages", ext.indexed_pages.toLocaleString()]);

      if (secondaryMetrics.length > 0) {
        y = renderSectionHeader(doc, "Additional Metrics", y, PDF_COLORS.seo);
        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: secondaryMetrics,
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Keyword Distribution ──
      const kwDistRows: string[][] = [];
      if (ext.keywords_top_3 !== undefined) kwDistRows.push(["Top 3", ext.keywords_top_3.toString()]);
      kwDistRows.push(["Top 10", current.keywords_top_10.toString()]);
      if (ext.keywords_top_20 !== undefined) kwDistRows.push(["Top 20", ext.keywords_top_20.toString()]);
      if (ext.keywords_top_50 !== undefined) kwDistRows.push(["Top 50", ext.keywords_top_50.toString()]);
      if (ext.keywords_improved !== undefined) kwDistRows.push(["Keywords Improved", ext.keywords_improved.toString()]);
      if (ext.keywords_declined !== undefined) kwDistRows.push(["Keywords Declined", ext.keywords_declined.toString()]);
      if (ext.new_keywords_gained !== undefined) kwDistRows.push(["New Keywords Gained", ext.new_keywords_gained.toString()]);
      if (ext.keywords_not_ranking !== undefined) kwDistRows.push(["Not Ranking", ext.keywords_not_ranking.toString()]);

      if (kwDistRows.length > 1) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Keyword Distribution", y, PDF_COLORS.seo);
        autoTable(doc, {
          startY: y,
          head: [["Range", "Count"]],
          body: kwDistRows,
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Key Metrics Comparison ──
      y = ensureSpace(doc, y, 60);
      y = renderSectionHeader(doc, "Key Metrics Comparison", y, PDF_COLORS.seo, prevMonth ? `${current.month} vs ${prevMonth.month}` : undefined);

      autoTable(doc, {
        startY: y,
        head: [["Metric", "Current", "Previous", "Change"]],
        body: [
          ["Domain Authority", current.domain_authority.toString(), prevMonth?.domain_authority?.toString() || "—", prevMonth ? pctText(current.domain_authority, prevMonth.domain_authority) : "—"],
          ["Backlinks", current.backlinks.toLocaleString(), prevMonth?.backlinks?.toLocaleString() || "—", prevMonth ? pctText(current.backlinks, prevMonth.backlinks) : "—"],
          ["Keywords Top 10", current.keywords_top_10.toString(), prevMonth?.keywords_top_10?.toString() || "—", prevMonth ? pctText(current.keywords_top_10, prevMonth.keywords_top_10) : "—"],
          ["Organic Traffic", current.organic_traffic.toLocaleString(), prevMonth?.organic_traffic?.toLocaleString() || "—", prevMonth ? pctText(current.organic_traffic, prevMonth.organic_traffic) : "—"],
        ],
        ...getTableStyles(PDF_COLORS.seo),
        didParseCell: (data: any) => colorChangeCell(data, 3),
      });
      y = (doc as any).lastAutoTable?.finalY || y + 50;
      y += 4;

      // ── Top Keywords ──
      const keywords: SeoKeyword[] = current.top_keywords || [];
      if (keywords.length > 0) {
        y = ensureSpace(doc, y, 60);
        y = renderSectionHeader(doc, "Top Keywords", y, PDF_COLORS.seo, `${keywords.length} keywords tracked`);

        autoTable(doc, {
          startY: y,
          head: [["#", "Keyword", "Position", "Change"]],
          body: keywords.map((kw, i) => [(i + 1).toString(), kw.keyword, `#${kw.position}`, kw.change]),
          ...getTableStyles(PDF_COLORS.seo),
          columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 90 } },
          didParseCell: (data: any) => colorChangeCell(data, 3),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Backlink Profile ──
      const hasBacklinkData = ext.referring_domains || ext.new_backlinks_gained || ext.dofollow_backlinks;
      if (hasBacklinkData) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Backlink Profile", y, PDF_COLORS.seo);

        const blRows: string[][] = [];
        if (ext.referring_domains !== undefined) blRows.push(["Referring Domains", ext.referring_domains.toString()]);
        if (ext.new_backlinks_gained !== undefined) blRows.push(["New Backlinks Gained", `+${ext.new_backlinks_gained}`]);
        if (ext.lost_backlinks !== undefined) blRows.push(["Lost Backlinks", ext.lost_backlinks.toString()]);
        if (ext.dofollow_backlinks !== undefined) blRows.push(["Dofollow Backlinks", ext.dofollow_backlinks.toString()]);
        if (ext.nofollow_backlinks !== undefined) blRows.push(["Nofollow Backlinks", ext.nofollow_backlinks.toString()]);

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: blRows,
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Referring Domains List ──
      if (ext.referring_domains_list && ext.referring_domains_list.length > 0) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Referring Domains", y, PDF_COLORS.seo, `${ext.referring_domains_list.length} domains`);

        autoTable(doc, {
          startY: y,
          head: [["Domain", "DA", "Type"]],
          body: ext.referring_domains_list.map(rd => [rd.domain, rd.da.toString(), rd.type]),
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Page Speed & Core Web Vitals ──
      if (ext.page_speed_mobile || ext.page_speed_desktop || ext.core_web_vitals) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Page Speed & Core Web Vitals", y, PDF_COLORS.seo);

        const speedRows: string[][] = [];
        if (ext.page_speed_mobile !== undefined) speedRows.push(["Mobile Speed Score", `${ext.page_speed_mobile}/100`]);
        if (ext.page_speed_desktop !== undefined) speedRows.push(["Desktop Speed Score", `${ext.page_speed_desktop}/100`]);
        if (ext.core_web_vitals) {
          speedRows.push(["LCP (Largest Contentful Paint)", ext.core_web_vitals.lcp]);
          speedRows.push(["FID (First Input Delay)", ext.core_web_vitals.fid]);
          speedRows.push(["CLS (Cumulative Layout Shift)", ext.core_web_vitals.cls]);
          if (ext.core_web_vitals.status) speedRows.push(["Core Web Vitals Status", ext.core_web_vitals.status]);
        }

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: speedRows,
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Technical Health ──
      if (ext.indexed_pages || ext.crawl_errors || ext.sitemap_pages) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Technical Health", y, PDF_COLORS.seo);

        const techRows: string[][] = [];
        if (ext.indexed_pages !== undefined) techRows.push(["Indexed Pages", ext.indexed_pages.toLocaleString()]);
        if (ext.sitemap_pages !== undefined) techRows.push(["Sitemap Pages", ext.sitemap_pages.toLocaleString()]);
        if (ext.crawl_errors !== undefined) techRows.push(["Crawl Errors", ext.crawl_errors.toString()]);

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: techRows,
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Technical Issues ──
      if (ext.technical_issues && ext.technical_issues.length > 0) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Technical Issues", y, PDF_COLORS.seo, `${ext.technical_issues.length} issues found`);

        autoTable(doc, {
          startY: y,
          head: [["Issue", "Count", "Severity"]],
          body: ext.technical_issues.map(i => [i.issue, i.count.toString(), i.severity]),
          ...getTableStyles(PDF_COLORS.seo),
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 2) {
              const val = (data.cell.text[0] || "").toLowerCase();
              data.cell.styles.fontStyle = "bold";
              if (val === "high" || val === "critical") data.cell.styles.textColor = PDF_COLORS.red;
              else if (val === "medium") data.cell.styles.textColor = [234, 179, 8]; // amber
              else data.cell.styles.textColor = PDF_COLORS.light;
            }
          },
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Top Landing Pages ──
      if (ext.top_landing_pages && ext.top_landing_pages.length > 0) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Top Landing Pages", y, PDF_COLORS.seo, `${ext.top_landing_pages.length} pages`);

        autoTable(doc, {
          startY: y,
          head: [["Page", "Sessions", "Bounce Rate"]],
          body: ext.top_landing_pages.map(p => [p.page, p.sessions.toLocaleString(), `${p.bounce_rate}%`]),
          ...getTableStyles(PDF_COLORS.seo),
          columnStyles: { 0: { cellWidth: 100 } },
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Top Traffic Sources ──
      if (ext.top_traffic_sources && ext.top_traffic_sources.length > 0) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Top Traffic Sources", y, PDF_COLORS.seo);

        autoTable(doc, {
          startY: y,
          head: [["Source", "Sessions", "%"]],
          body: ext.top_traffic_sources.map(s => [s.source, s.sessions.toLocaleString(), `${s.percentage}%`]),
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Top Pages by Traffic ──
      if (ext.top_pages_by_traffic && ext.top_pages_by_traffic.length > 0) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Top Pages by Traffic", y, PDF_COLORS.seo);

        autoTable(doc, {
          startY: y,
          head: [["Page", "Traffic", "Change"]],
          body: ext.top_pages_by_traffic.map(p => [p.page, p.traffic.toLocaleString(), p.change]),
          ...getTableStyles(PDF_COLORS.seo),
          columnStyles: { 0: { cellWidth: 100 } },
          didParseCell: (data: any) => colorChangeCell(data, 2),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Device Breakdown ──
      if (ext.device_breakdown) {
        y = ensureSpace(doc, y, 40);
        y = renderSectionHeader(doc, "Device Breakdown", y, PDF_COLORS.seo);

        autoTable(doc, {
          startY: y,
          head: [["Device", "Percentage"]],
          body: [
            ["Desktop", `${ext.device_breakdown.desktop}%`],
            ["Mobile", `${ext.device_breakdown.mobile}%`],
            ["Tablet", `${ext.device_breakdown.tablet}%`],
          ].filter(r => r[1] !== "0%"),
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Traffic Breakdown ──
      if (ext.monthly_traffic_breakdown) {
        y = ensureSpace(doc, y, 40);
        y = renderSectionHeader(doc, "Traffic Channel Breakdown", y, PDF_COLORS.seo);

        const tb = ext.monthly_traffic_breakdown;
        autoTable(doc, {
          startY: y,
          head: [["Channel", "Percentage"]],
          body: [
            ["Organic", `${tb.organic}%`],
            ["Direct", `${tb.direct}%`],
            ["Referral", `${tb.referral}%`],
            ["Social", `${tb.social}%`],
            ["Paid", `${tb.paid}%`],
          ].filter(r => r[1] !== "0%"),
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Geographic Breakdown ──
      if (ext.geo_breakdown && ext.geo_breakdown.length > 0) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Geographic Breakdown", y, PDF_COLORS.seo);

        autoTable(doc, {
          startY: y,
          head: [["Country / Region", "Sessions", "%"]],
          body: ext.geo_breakdown.map(g => [g.country, g.sessions.toLocaleString(), `${g.percentage}%`]),
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Local SEO ──
      if (ext.local_seo && (ext.local_seo.reviews_count || ext.local_seo.local_pack_keywords)) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Local SEO", y, PDF_COLORS.seo);

        const localRows: string[][] = [];
        if (ext.local_seo.google_business_profile) localRows.push(["Google Business Profile", ext.local_seo.google_business_profile]);
        if (ext.local_seo.reviews_count) localRows.push(["Reviews", ext.local_seo.reviews_count.toString()]);
        if (ext.local_seo.avg_rating) localRows.push(["Average Rating", `${ext.local_seo.avg_rating} ★`]);
        if (ext.local_seo.local_pack_keywords) localRows.push(["Local Pack Keywords", ext.local_seo.local_pack_keywords.toString()]);

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: localRows,
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Competitor Comparison ──
      if (ext.competitor_comparison && ext.competitor_comparison.length > 0) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Competitor Comparison", y, PDF_COLORS.seo);

        autoTable(doc, {
          startY: y,
          head: [["Competitor", "DA", "Traffic", "Keywords"]],
          body: ext.competitor_comparison.map(c => [c.competitor, c.da.toString(), c.traffic.toLocaleString(), c.keywords.toLocaleString()]),
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Conversions ──
      if (ext.conversion_data && (ext.conversion_data.goals_completed || ext.conversion_data.conversion_rate)) {
        y = ensureSpace(doc, y, 40);
        y = renderSectionHeader(doc, "Conversion Data", y, PDF_COLORS.seo);

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: [
            ["Goals Completed", ext.conversion_data.goals_completed.toString()],
            ["Conversion Rate", `${ext.conversion_data.conversion_rate}%`],
          ],
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      // ── Content Recommendations ──
      if (ext.content_recommendations && ext.content_recommendations.length > 0) {
        y = ensureSpace(doc, y, 50);
        y = renderSectionHeader(doc, "Content Recommendations", y, PDF_COLORS.seo);

        autoTable(doc, {
          startY: y,
          head: [["#", "Recommendation"]],
          body: ext.content_recommendations.map((r, i) => [(i + 1).toString(), r]),
          ...getTableStyles(PDF_COLORS.seo),
          columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 160 } },
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }
      } // end if (current)

      // ── GA4 Traffic Acquisition (for the report month) ──
      if (ga4 && ga4.isConnected && ga4.totals.sessions > 0) {
        const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
        const fmtSec = (s: number) => {
          if (!s || !isFinite(s)) return "0s";
          const m = Math.floor(s / 60);
          const sec = Math.round(s % 60);
          return m === 0 ? `${sec}s` : `${m}m ${sec}s`;
        };

        y = ensureSpace(doc, y, 60);
        y = renderSectionHeader(doc, "Traffic Acquisition", y, PDF_COLORS.seo, `Source: Google Analytics 4 (${activeMonth})`);

        autoTable(doc, {
          startY: y,
          head: [["Metric", "Value"]],
          body: [
            ["Sessions", fmtNum(ga4.totals.sessions)],
            ["Engaged Sessions", fmtNum(ga4.totals.engagedSessions)],
            ["Engagement Rate", `${(ga4.totals.engagementRate * 100).toFixed(1)}%`],
            ["Avg. Engagement Time", fmtSec(ga4.totals.avgEngagementTimeSeconds)],
            ["Events / Session", ga4.totals.eventsPerSession.toFixed(2)],
          ],
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;

        if (ga4.channels.length > 0) {
          y = ensureSpace(doc, y, 60);
          y = renderSectionHeader(doc, "Sessions by Channel", y, PDF_COLORS.seo);

          autoTable(doc, {
            startY: y,
            head: [["#", "Channel", "Sessions", "%", "Engaged", "Eng. Rate", "Avg. Time", "Events/Sess"]],
            body: ga4.channels.map((c, i) => [
              (i + 1).toString(),
              c.channel,
              fmtNum(c.sessions),
              `${ga4.totals.sessions > 0 ? ((c.sessions / ga4.totals.sessions) * 100).toFixed(1) : 0}%`,
              fmtNum(c.engagedSessions),
              `${(c.engagementRate * 100).toFixed(1)}%`,
              fmtSec(c.avgEngagementTimeSeconds),
              c.eventsPerSession.toFixed(2),
            ]),
            ...getTableStyles(PDF_COLORS.seo),
            columnStyles: { 0: { cellWidth: 10 } },
          });
          y = (doc as any).lastAutoTable?.finalY || y + 50;
          y += 4;
      }

      // ── CTA Performance ──
      if (ctaData && ctaData.grandTotal > 0) {
        const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
        y = ensureSpace(doc, y, 60);
        y = renderSectionHeader(doc, "Call-to-Action Performance", y, PDF_COLORS.seo, `Source: Google Analytics 4 (${activeMonth})`);

        autoTable(doc, {
          startY: y,
          head: [["Call-to-Action", "Clicks"]],
          body: CTA_ORDER.map((k) => [CTA_LABELS[k], fmtNum(ctaData.totals[k])])
            .concat([["Total", fmtNum(ctaData.grandTotal)]]),
          ...getTableStyles(PDF_COLORS.seo),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
        y += 4;
      }

      }

      // ── Historical Traffic Trend ──
      if (rows.length > 1) {
        y = ensureSpace(doc, y, 60);
        y = renderSectionHeader(doc, "Month-over-Month History", y, PDF_COLORS.seo);

        autoTable(doc, {
          startY: y,
          head: [["Month", "Organic Traffic", "DA", "Backlinks", "Keywords Top 10"]],
          body: [...rows].sort((a, b) => b.month.localeCompare(a.month)).map(r => [
            r.month, r.organic_traffic.toLocaleString(), r.domain_authority.toString(), r.backlinks.toLocaleString(), r.keywords_top_10.toString(),
          ]),
          ...getTableStyles(PDF_COLORS.seo),
        });
      }

      await finalizePDF(doc);
      doc.save(`${clinicName.replace(/\s+/g, "_")}_SEO_Report_${activeMonth}.pdf`);
    } finally {
      setGenerating(false);
    }
  }, [activeMonth, current, prevMonth, rows, clinicName, ga4, ctaData]);

  if (!clinicId) {
    return <p className="text-muted-foreground text-sm text-center py-12">Select a clinic to generate reports.</p>;
  }

  const ext: SeoExtendedData = current?.extended_data || {};
  const hasExtended = current && Object.keys(ext).some(k => {
    const v = (ext as any)[k];
    return v !== null && v !== 0 && v !== "" && !(Array.isArray(v) && v.length === 0);
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Generate SEO Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Report Month</label>
              <Select value={activeMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select month" /></SelectTrigger>
                <SelectContent>
                  {months.map(m => {
                    const [y, mo] = m.split("-");
                    const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
                    return (<SelectItem key={m} value={m}>{label}</SelectItem>);
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generatePDF} disabled={!activeMonth || generating} className="gap-2">
              <Download className="h-4 w-4" />
              {generating ? "Generating…" : "Download PDF Report"}
            </Button>
          </div>
          {isLoading && <p className="text-xs text-muted-foreground mt-3">Loading data…</p>}
          {!isLoading && !current && <p className="text-xs text-muted-foreground mt-3">No stored SEO metrics for this month — the PDF will include Google Analytics traffic data only.</p>}
          {hasExtended && (
            <p className="text-xs text-success mt-3">✓ Extended data available - PDF will include all detailed sections.</p>
          )}
        </CardContent>
      </Card>

      {current && !isLoading && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Report Preview - {current.month}
              </CardTitle>
              {prevMonth && <span className="text-[10px] text-muted-foreground">vs {prevMonth.month}</span>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <PreviewStat icon={Globe} label="Domain Authority" value={current.domain_authority.toString()} change={pctChange(current.domain_authority, prevMonth?.domain_authority)} />
              <PreviewStat icon={Link2} label="Backlinks" value={current.backlinks.toLocaleString()} change={pctChange(current.backlinks, prevMonth?.backlinks)} />
              <PreviewStat icon={Hash} label="Keywords Top 10" value={current.keywords_top_10.toString()} change={pctChange(current.keywords_top_10, prevMonth?.keywords_top_10)} />
              <PreviewStat icon={TrendingUp} label="Organic Traffic" value={current.organic_traffic.toLocaleString()} change={pctChange(current.organic_traffic, prevMonth?.organic_traffic)} />
            </div>

            {/* Extended data summary */}
            {hasExtended && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 pt-3 border-t border-border/40">
                {ext.avg_position ? <MiniPreview label="Avg Position" value={ext.avg_position.toFixed(1)} /> : null}
                {ext.bounce_rate ? <MiniPreview label="Bounce Rate" value={`${ext.bounce_rate}%`} /> : null}
                {ext.page_speed_mobile ? <MiniPreview label="Mobile Speed" value={`${ext.page_speed_mobile}/100`} /> : null}
                {ext.page_speed_desktop ? <MiniPreview label="Desktop Speed" value={`${ext.page_speed_desktop}/100`} /> : null}
                {ext.referring_domains ? <MiniPreview label="Referring Domains" value={ext.referring_domains.toString()} /> : null}
                {ext.indexed_pages ? <MiniPreview label="Indexed Pages" value={ext.indexed_pages.toLocaleString()} /> : null}
                {ext.crawl_errors ? <MiniPreview label="Crawl Errors" value={ext.crawl_errors.toString()} /> : null}
                {ext.total_keywords_tracked ? <MiniPreview label="Keywords Tracked" value={ext.total_keywords_tracked.toString()} /> : null}
              </div>
            )}

            {current.top_keywords && current.top_keywords.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Top Keywords</h4>
                <div className="space-y-1">
                  {current.top_keywords.slice(0, 8).map((kw, i) => (
                    <div key={i} className="flex justify-between text-xs py-1 border-b border-border/50">
                      <span className="font-medium truncate max-w-[200px]">{kw.keyword}</span>
                      <div className="flex gap-3">
                        <span className="tabular-nums text-muted-foreground">#{kw.position}</span>
                        <span className={`tabular-nums font-medium ${kw.change.startsWith("+") ? "text-success" : kw.change.startsWith("-") ? "text-destructive" : "text-muted-foreground"}`}>
                          {kw.change}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreviewStat({ icon: Icon, label, value, change }: { icon: React.ElementType; label: string; value: string; change: { text: string; color: string } }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
      <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <span className={`text-[10px] font-medium ${change.color}`}>{change.text}</span>
    </div>
  );
}

function MiniPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-2 rounded bg-muted/30">
      <p className="text-sm font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
