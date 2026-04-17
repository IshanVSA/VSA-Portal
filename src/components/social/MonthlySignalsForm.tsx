import { useState, useEffect, useCallback } from "react";
import { useMonthlySignals } from "@/hooks/useMonthlySignals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, CalendarClock, Plus, X, DollarSign, Newspaper, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  clinicId: string | undefined;
}

const CURRENCIES = ["CAD", "USD"];

function TagInput({ label, tags, onChange, placeholder }: { label: string; tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder={placeholder || "Type and press Enter"}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} className="shrink-0">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tags.map((tag, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-xs">
              {tag}
              <button type="button" onClick={() => onChange(tags.filter((_, j) => j !== i))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MonthlySignalsForm({ clinicId }: Props) {
  const { signals, isLoading, upsertSignals, currentMonth } = useMonthlySignals(clinicId);
  const [saving, setSaving] = useState(false);

  const [campaignMonth, setCampaignMonth] = useState<number>(1);
  const [budget, setBudget] = useState<number>(0);
  const [currency, setCurrency] = useState("CAD");
  const [seasonalTopics, setSeasonalTopics] = useState<string[]>([]);
  const [communityEvents, setCommunityEvents] = useState<string[]>([]);
  const [localAlerts, setLocalAlerts] = useState<string[]>([]);
  const [localNews, setLocalNews] = useState<string[]>([]);
  const [clinicNews, setClinicNews] = useState("");
  const [fbSpecific, setFbSpecific] = useState("");
  const [stockCount, setStockCount] = useState(12);
  const [assetCount, setAssetCount] = useState(0);
  const [holidays, setHolidays] = useState<any[]>([]);

  useEffect(() => {
    if (!signals) return;
    setCampaignMonth(signals.campaign_month_number ?? 1);
    setBudget(signals.monthly_budget ?? 0);
    setCurrency(signals.currency ?? "CAD");
    setSeasonalTopics((signals.seasonal_topics as string[]) || []);
    setCommunityEvents((signals.community_events as string[]) || []);
    setLocalAlerts((signals.local_alerts as string[]) || []);
    setLocalNews((signals.local_news as string[]) || []);
    setClinicNews(signals.clinic_news_this_month ?? "");
    setFbSpecific(signals.facebook_specific_this_month ?? "");
    setStockCount(signals.stock_post_count ?? 12);
    setAssetCount(signals.client_asset_post_count ?? 0);
    setHolidays((signals.statutory_holidays as any[]) || []);
  }, [signals]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await upsertSignals.mutateAsync({
        campaign_month_number: campaignMonth,
        monthly_budget: budget,
        currency,
        seasonal_topics: seasonalTopics as any,
        community_events: communityEvents as any,
        local_alerts: localAlerts as any,
        local_news: localNews as any,
        clinic_news_this_month: clinicNews,
        facebook_specific_this_month: fbSpecific,
        stock_post_count: stockCount,
        client_asset_post_count: assetCount,
      });
    } finally {
      setSaving(false);
    }
  }, [campaignMonth, budget, currency, seasonalTopics, communityEvents, localAlerts, localNews, clinicNews, fbSpecific, stockCount, assetCount, upsertSignals]);

  const monthLabel = currentMonth ? new Date(currentMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Monthly Signals
          </CardTitle>
          <Badge variant="outline" className="text-xs">{monthLabel}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure campaign parameters and contextual signals for the AI content engine this month.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Row 1: Campaign Month, Budget, Currency */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Campaign Month #</Label>
            <Input type="number" min={1} value={campaignMonth} onChange={(e) => setCampaignMonth(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Monthly Budget</Label>
            <Input type="number" min={0} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Post counts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Stock Post Count</Label>
            <Input type="number" min={0} max={20} value={stockCount} onChange={(e) => setStockCount(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">AI-generated posts this month (max 12 default)</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Client Asset Post Count</Label>
            <Input type="number" min={0} value={assetCount} onChange={(e) => setAssetCount(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">Posts from client-provided photos/videos</p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Monthly Signals
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          Community & Local Context
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Local events, alerts, news, and clinic updates that shape this month's content.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <TagInput label="Community Events" tags={communityEvents} onChange={setCommunityEvents} placeholder="e.g. Local pet adoption fair" />
        <TagInput label="Local Alerts" tags={localAlerts} onChange={setLocalAlerts} placeholder="e.g. Tick season warning" />
        <TagInput label="Local News" tags={localNews} onChange={setLocalNews} placeholder="e.g. New dog park opening nearby" />

        <div className="space-y-1.5">
          <Label className="text-sm font-medium flex items-center gap-1"><Newspaper className="h-3.5 w-3.5" /> Clinic News This Month</Label>
          <Textarea value={clinicNews} onChange={(e) => setClinicNews(e.target.value)} placeholder="New vet joining, equipment upgrade, etc." rows={3} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Facebook-Specific Notes</Label>
          <Textarea value={fbSpecific} onChange={(e) => setFbSpecific(e.target.value)} placeholder="Any Facebook-only instructions or notes" rows={2} />
        </div>

        {holidays.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Statutory Holidays (auto-populated)</Label>
            <div className="flex flex-wrap gap-1.5">
              {holidays.map((h: any, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{h.name}{h.day ? ` (Day ${h.day})` : ""}</Badge>
              ))}
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} variant="outline" className="gap-2">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Context
        </Button>
      </CardContent>
    </Card>
    </>
  );
}
