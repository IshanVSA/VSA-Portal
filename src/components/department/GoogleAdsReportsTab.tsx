import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, DollarSign, MousePointerClick, Percent, Megaphone, BarChart3 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PDF_COLORS, renderPDFHeader, renderSectionHeader, renderKPICards,
  getTableStyles, colorChangeCell, finalizePDF, ensureSpace,
} from "@/lib/pdf-theme";

interface Campaign {
  name: string;
  clicks: number;
  impressions: number;
  cost: number;
}

interface DailyTrend {
  date: string;
  clicks: number;
  impressions: number;
  cost: number;
}

interface SearchTermDaily {
  date: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
}

interface SearchTerm {
  term: string;
  keyword: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
  daily?: SearchTermDaily[];
}

interface MetricsJson {
  clicks: number;
  impressions: number;
  cost: number;
  daily_trends: DailyTrend[];
  campaigns: Campaign[];
  search_terms?: SearchTerm[];
}

interface Props {
  clinicId: string;
}

interface ComputedMetrics {
  clicks: number;
  impressions: number;
  cost: number;
  ctr: number;
  cpc: number;
  campaigns: Campaign[];
  dailyTrends: DailyTrend[];
  searchTerms: SearchTerm[];
}

function computeMetrics(m: MetricsJson): ComputedMetrics {
  const { clicks, impressions, cost, daily_trends, campaigns, search_terms } = m;
  const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
  const cpc = clicks > 0 ? Math.round((cost / clicks) * 100) / 100 : 0;
  const sortedCampaigns = [...campaigns].sort((a, b) => b.cost - a.cost);
  const searchTerms = (search_terms || [])
    .filter(s => s.impressions > 0 || s.clicks > 0)
    .sort((a, b) => b.cost - a.cost || b.clicks - a.clicks)
    .slice(0, 25);
  return { clicks, impressions, cost, ctr, cpc, campaigns: sortedCampaigns, dailyTrends: daily_trends || [], searchTerms };
}

function fmtCurrency(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function GoogleAdsReportsTab({ clinicId }: Props) {
  const [metricsData, setMetricsData] = useState<MetricsJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [clinicName, setClinicName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicId) { setLoading(false); return; }
    const fetchData = async () => {
      setLoading(true);
      const [{ data }, { data: clinicData }] = await Promise.all([
        supabase
          .from("analytics")
          .select("metrics_json, recorded_at")
          .eq("clinic_id", clinicId)
          .eq("platform", "google_ads")
          .eq("metric_type", "monthly_summary")
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("clinics").select("clinic_name").eq("id", clinicId).single(),
      ]);
      setMetricsData(data?.metrics_json ? (data.metrics_json as unknown as MetricsJson) : null);
      setRecordedAt(data?.recorded_at || null);
      setClinicName(clinicData?.clinic_name || "Unknown Clinic");
      setLoading(false);
    };
    fetchData();
  }, [clinicId]);

  const computed = useMemo(() => (metricsData ? computeMetrics(metricsData) : null), [metricsData]);

  const generatePDF = useCallback(async () => {
    if (!computed) return;
    setGenerating(true);

    try {
      const doc = new jsPDF();
      const periodStr = recordedAt
        ? `Report synced: ${format(new Date(recordedAt), "MMM d, yyyy 'at' h:mm a")}`
        : "Last 30 Days";

      // ── Header ──
      let y = renderPDFHeader(doc, "Google Ads Performance Report", clinicName, periodStr, PDF_COLORS.googleAds);

      // ── KPI Cards ──
      y = renderKPICards(doc, y, [
        { label: "Total Ad Spend", value: fmtCurrency(computed.cost) },
        { label: "Clicks", value: computed.clicks.toLocaleString() },
        { label: "Avg. CPC", value: fmtCurrency(computed.cpc) },
        { label: "CTR", value: `${computed.ctr}%` },
      ], PDF_COLORS.googleAds);

      // ── Key Metrics Table ──
      y = renderSectionHeader(doc, "Key Metrics", y, PDF_COLORS.googleAds);

      autoTable(doc, {
        startY: y,
        head: [["Metric", "Value"]],
        body: [
          ["Total Ad Spend", fmtCurrency(computed.cost)],
          ["Clicks", computed.clicks.toLocaleString()],
          ["Impressions", computed.impressions.toLocaleString()],
          ["CTR", `${computed.ctr}%`],
          ["Avg. CPC", fmtCurrency(computed.cpc)],
        ],
        ...getTableStyles(PDF_COLORS.googleAds),
        columnStyles: { 1: { fontStyle: "bold" as const } },
      });
      y = (doc as any).lastAutoTable?.finalY || y + 50;

      // ── Daily Performance ──
      if (computed.dailyTrends.length > 0) {
        y = ensureSpace(doc, y + 8, 60);
        y = renderSectionHeader(doc, "Daily Performance", y, PDF_COLORS.googleAds);

        autoTable(doc, {
          startY: y,
          head: [["Date", "Spend", "Clicks", "Impressions"]],
          body: computed.dailyTrends.map(d => [
            d.date,
            fmtCurrency(d.cost),
            d.clicks.toLocaleString(),
            d.impressions.toLocaleString(),
          ]),
          ...getTableStyles(PDF_COLORS.googleAds),
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;
      }

      // ── Campaign Performance ──
      if (computed.campaigns.length > 0) {
        y = ensureSpace(doc, y + 8, 60);
        y = renderSectionHeader(doc, "Campaign Performance", y, PDF_COLORS.googleAds);

        autoTable(doc, {
          startY: y,
          head: [["Campaign", "Spend", "Clicks", "Impressions", "CTR", "CPC"]],
          body: computed.campaigns.map(c => {
            const ctr = c.impressions > 0 ? `${(Math.round((c.clicks / c.impressions) * 10000) / 100)}%` : "0%";
            const cpc = c.clicks > 0 ? fmtCurrency(Math.round((c.cost / c.clicks) * 100) / 100) : "$0.00";
            return [c.name, fmtCurrency(c.cost), c.clicks.toLocaleString(), c.impressions.toLocaleString(), ctr, cpc];
          }),
          ...getTableStyles(PDF_COLORS.googleAds),
          columnStyles: { 0: { cellWidth: 50 } },
        });
        y = (doc as any).lastAutoTable?.finalY || y + 50;

        // ── Spend Distribution ──
        y = ensureSpace(doc, y + 8, 50);
        y = renderSectionHeader(doc, "Spend Distribution", y, PDF_COLORS.googleAds);

        const totalSpend = computed.cost;
        autoTable(doc, {
          startY: y,
          head: [["Campaign", "Spend", "% of Total"]],
          body: computed.campaigns.map(c => [
            c.name,
            fmtCurrency(c.cost),
            totalSpend > 0 ? `${(Math.round((c.cost / totalSpend) * 1000) / 10)}%` : "0%",
          ]),
          ...getTableStyles(PDF_COLORS.googleAds),
          columnStyles: { 0: { cellWidth: 80 } },
        });
      }

      // ── Top Search Terms ──
      if (computed.searchTerms.length > 0) {
        y = ensureSpace(doc, y + 8, 60);
        y = renderSectionHeader(doc, "Top Search Terms", y, PDF_COLORS.googleAds, `Top ${computed.searchTerms.length} search terms by spend`);

        autoTable(doc, {
          startY: y,
          head: [["#", "Search Term", "Matched Keyword", "Clicks", "Impr.", "Cost", "CTR", "CPC"]],
          body: computed.searchTerms.map((s, i) => {
            const ctr = s.impressions > 0 ? `${Math.round((s.clicks / s.impressions) * 10000) / 100}%` : "0%";
            const cpc = s.clicks > 0 ? fmtCurrency(Math.round((s.cost / s.clicks) * 100) / 100) : "$0.00";
            return [
              (i + 1).toString(),
              s.term,
              s.keyword || "—",
              s.clicks.toLocaleString(),
              s.impressions.toLocaleString(),
              fmtCurrency(s.cost),
              ctr,
              cpc,
            ];
          }),
          ...getTableStyles(PDF_COLORS.googleAds),
          columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 55 }, 2: { cellWidth: 40 } },
        });
      }


      await finalizePDF(doc);
      doc.save(`${clinicName.replace(/\s+/g, "_")}_Google_Ads_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } finally {
      setGenerating(false);
    }
  }, [computed, clinicName, recordedAt]);

  if (!clinicId) {
    return <p className="text-muted-foreground text-sm text-center py-12">Select a clinic to generate reports.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Generate Google Ads Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <Button onClick={generatePDF} disabled={loading || !computed || generating} className="gap-2">
              <Download className="h-4 w-4" />
              {generating ? "Generating…" : "Download PDF Report"}
            </Button>
          </div>
          {loading && <p className="text-xs text-muted-foreground mt-3">Loading data…</p>}
          {!loading && !computed && <p className="text-xs text-muted-foreground mt-3">No Google Ads data available. Sync data from the Analytics tab first.</p>}
          {recordedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Data from: {format(new Date(recordedAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </CardContent>
      </Card>

      {computed && !loading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Report Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <PreviewStat icon={DollarSign} label="Ad Spend" value={fmtCurrency(computed.cost)} />
              <PreviewStat icon={MousePointerClick} label="Clicks" value={computed.clicks.toLocaleString()} sub={`${computed.impressions.toLocaleString()} impr.`} />
              <PreviewStat icon={DollarSign} label="Avg. CPC" value={fmtCurrency(computed.cpc)} sub={`${computed.clicks.toLocaleString()} clicks`} />
              <PreviewStat icon={Percent} label="CTR" value={`${computed.ctr}%`} sub={`${computed.impressions.toLocaleString()} impr.`} />
            </div>
            {computed.campaigns.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Megaphone className="h-3.5 w-3.5" /> Campaign Performance
                  </h4>
                  <div className="space-y-1">
                    {computed.campaigns.slice(0, 5).map(c => (
                      <div key={c.name} className="flex justify-between text-xs py-1 border-b border-border/50">
                        <span className="truncate max-w-[180px] font-medium">{c.name}</span>
                        <span className="tabular-nums text-muted-foreground">{fmtCurrency(c.cost)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> Spend Distribution
                  </h4>
                  <div className="space-y-1">
                    {computed.campaigns.slice(0, 5).map(c => {
                      const pct = computed.cost > 0 ? Math.round((c.cost / computed.cost) * 1000) / 10 : 0;
                      return (
                        <div key={c.name} className="text-xs py-1 border-b border-border/50">
                          <div className="flex justify-between mb-1">
                            <span className="truncate max-w-[160px]">{c.name}</span>
                            <span className="tabular-nums text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreviewStat({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
      <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
