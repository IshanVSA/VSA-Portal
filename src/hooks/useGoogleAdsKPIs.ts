import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GoogleAdsKPIs {
  loading: boolean;
  hasData: boolean;
  clicks: number;
  impressions: number;
  cost: number;
  cpc: number;
  ctr: number;
  dailyTrend: { label: string; value: number }[];
  campaigns: { name: string; spend: string; clicks: string; cpc: string; ctr: string }[];
}

export function useGoogleAdsKPIs(clinicId: string): GoogleAdsKPIs {
  const [state, setState] = useState<GoogleAdsKPIs>({
    loading: true, hasData: false,
    clicks: 0, impressions: 0, cost: 0, cpc: 0, ctr: 0,
    dailyTrend: [], campaigns: [],
  });

  useEffect(() => {
    if (!clinicId) {
      setState(prev => ({ ...prev, loading: false, hasData: false }));
      return;
    }

    const fetch = async () => {
      setState({ loading: true, hasData: false, clicks: 0, impressions: 0, cost: 0, cpc: 0, ctr: 0, dailyTrend: [], campaigns: [] });

      const { data } = await supabase
        .from("analytics")
        .select("metrics_json")
        .eq("clinic_id", clinicId)
        .eq("platform", "google_ads")
        .eq("metric_type", "monthly_summary")
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data?.metrics_json) {
        setState({ loading: false, hasData: false, clicks: 0, impressions: 0, cost: 0, cpc: 0, ctr: 0, dailyTrend: [], campaigns: [] });
        return;
      }

      const m = data.metrics_json as any;
      const clicks = m.clicks || 0;
      const impressions = m.impressions || 0;
      const cost = m.cost || 0;
      const cpc = clicks > 0 ? Math.round((cost / clicks) * 100) / 100 : 0;
      const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;

      const trends = (m.daily_trends || []) as { date: string; clicks: number }[];
      const last30 = trends.slice(-30).map(d => ({
        label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: d.clicks,
      }));

      const campaigns = ((m.campaigns || []) as any[])
        .sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0))
        .slice(0, 5)
        .map((c: any) => {
          const cClicks = c.clicks || 0;
          const cCost = c.cost || 0;
          const cImpressions = c.impressions || 1;
          return {
            name: c.name,
            spend: `$${cCost.toFixed(0)}`,
            clicks: cClicks.toLocaleString(),
            cpc: cClicks > 0 ? `$${(cCost / cClicks).toFixed(2)}` : "$0.00",
            ctr: `${((cClicks / cImpressions) * 100).toFixed(1)}%`,
          };
        });

      setState({
        loading: false, hasData: true,
        clicks, impressions, cost, cpc, ctr,
        dailyTrend: last30.length > 0 ? last30 : [{ label: "—", value: 0 }],
        campaigns,
      });
    };

    fetch();
  }, [clinicId]);

  return state;
}
