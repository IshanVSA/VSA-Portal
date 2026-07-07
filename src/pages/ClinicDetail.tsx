import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserDepartments } from "@/hooks/useUserDepartments";
import { useAuth } from "@/hooks/useAuth";

const DEBRAJ_USER_ID = "ac32880b-4a29-4617-9ab9-d4b28ed7b998";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, Loader2, Users, Sparkles, Globe, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { extractEdgeFunctionError, describeError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { MetaConnectionCard } from "@/components/clinic-detail/MetaConnectionCard";
import { PageSelectionDialog } from "@/components/clinic-detail/PageSelectionDialog";
import { FacebookInsightCard } from "@/components/clinic-detail/FacebookInsightCard";
import { GoogleAdsConnectionCard } from "@/components/clinic-detail/GoogleAdsConnectionCard";
import { GoogleAccountSelectionDialog } from "@/components/clinic-detail/GoogleAccountSelectionDialog";
import { GBPConnectionCard } from "@/components/clinic-detail/GBPConnectionCard";
import { GBPLocationSelectionDialog } from "@/components/clinic-detail/GBPLocationSelectionDialog";
import { GA4ConnectionCard } from "@/components/clinic-detail/GA4ConnectionCard";
import { GA4PropertySelectionDialog, type GA4Property } from "@/components/clinic-detail/GA4PropertySelectionDialog";
import { GSCConnectionCard } from "@/components/clinic-detail/GSCConnectionCard";
import { GSCPropertySelectionDialog, type GSCSite } from "@/components/clinic-detail/GSCPropertySelectionDialog";
import { TrackingSetupCard } from "@/components/clinic-detail/TrackingSetupCard";
import { CtaTrackingSetupCard } from "@/components/clinic-detail/CtaTrackingSetupCard";
import { SearchAtlasSetupCard } from "@/components/clinic-detail/SearchAtlasSetupCard";
import { ClinicLogoUploader } from "@/components/clinic-detail/ClinicLogoUploader";
import { COMMON_TIMEZONES, DEFAULT_CLINIC_TIMEZONE, getSafeTimeZone } from "@/lib/website-analytics";

interface ClinicData {
  clinic_name: string;
  website: string | null;
  timezone: string | null;
  logo_url: string | null;
  website_enabled?: boolean;
  seo_enabled?: boolean;
  google_ads_enabled?: boolean;
  ai_seo_enabled?: boolean;
  social_media_enabled?: boolean;
}
interface ClinicCredentials {
  meta_page_id: string | null;
  meta_instagram_business_id: string | null;
  meta_page_name: string | null;
  meta_granted_scopes: string[] | null;
  google_ads_customer_id: string | null;
  google_ads_login_customer_id: string | null;
  google_ads_account_name: string | null;
  last_meta_sync_at: string | null;
  last_google_sync_at: string | null;
  gbp_account_id: string | null;
  gbp_location_id: string | null;
  gbp_location_name: string | null;
  gbp_connected_at: string | null;
}

type ClinicAccessKey = "website_enabled" | "seo_enabled" | "google_ads_enabled" | "ai_seo_enabled" | "social_media_enabled";

const clinicAccessRows: Array<{ key: ClinicAccessKey; label: string; description: string }> = [
  { key: "website_enabled", label: "Website", description: "Enable the Website workspace for this clinic" },
  { key: "seo_enabled", label: "SEO", description: "Enable SEO dashboards, reports, and tickets" },
  { key: "google_ads_enabled", label: "Google Ads", description: "Enable Google Ads dashboards, analytics, and tickets" },
  { key: "ai_seo_enabled", label: "AI SEO", description: "Enable AI SEO workspace access" },
  { key: "social_media_enabled", label: "Social Media", description: "Enable content, requests, calendar, and uploads" },
];

function TimezoneField({ clinicId, currentTimezone, onSaved }: { clinicId: string; currentTimezone: string | null; onSaved: (timezone: string) => void }) {
  const normalizedCurrent = getSafeTimeZone(currentTimezone);
  const [timezone, setTimezone] = useState(normalizedCurrent);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setTimezone(normalizedCurrent); }, [normalizedCurrent]);

  const timezoneOptions = normalizedCurrent && !COMMON_TIMEZONES.includes(normalizedCurrent)
    ? [normalizedCurrent, ...COMMON_TIMEZONES]
    : COMMON_TIMEZONES;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("clinics").update({ timezone }).eq("id", clinicId);
    setSaving(false);
    if (error) { toast.error("Failed to save clinic timezone", { description: describeError(error) }); return; }
    onSaved(timezone);
    toast.success("Clinic timezone saved");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {timezoneOptions.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={save} disabled={saving || timezone === normalizedCurrent}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Website analytics and reports will use this clinic timezone for daily and hourly metrics.</p>
    </div>
  );
}

function WebsiteUrlField({ clinicId, currentUrl, onSaved }: { clinicId: string; currentUrl: string; onSaved: (url: string) => void }) {
  const [url, setUrl] = useState(currentUrl);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { setUrl(currentUrl); }, [currentUrl]);

  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed || trimmed === (currentUrl || "")) { setDuplicate(null); return; }
    if (!trimmed.startsWith("https://")) { setDuplicate(null); return; }
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const normalized = new URL(trimmed).toString();
        const { data } = await supabase.from("clinics").select("id, clinic_name").eq("website", normalized).limit(1);
        const match = data?.find((c: any) => c.id !== clinicId);
        setDuplicate(match ? match.clinic_name : null);
      } catch { setDuplicate(null); }
      setChecking(false);
    }, 500);
    return () => { clearTimeout(timer); setChecking(false); };
  }, [url, clinicId, currentUrl]);

  const save = async () => {
    const trimmed = url.trim();
    if (trimmed && !trimmed.startsWith("https://")) {
      toast.error("Website URL must start with https://");
      return;
    }
    if (duplicate) { toast.error("A clinic with this website already exists"); return; }
    setSaving(true);
    const { error } = await supabase.from("clinics").update({ website: trimmed || null }).eq("id", clinicId);
    setSaving(false);
    if (error) { toast.error("Failed to save website URL", { description: describeError(error) }); return; }
    onSaved(trimmed);
    toast.success("Website URL saved");
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1"
        />
        <Button size="sm" onClick={save} disabled={saving || !!duplicate || checking || url.trim() === (currentUrl || "")}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save
        </Button>
      </div>
      {duplicate && (
        <p className="text-sm text-destructive">⚠ A clinic with this website already exists: "{duplicate}"</p>
      )}
    </div>
  );
}

export default function ClinicDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useUserRole();
  const { departments, isAllAccess } = useUserDepartments();
  const canSeeGoogleAds = isAllAccess || (departments?.includes("google_ads") ?? false);
  const canSeeAIInsights = isAllAccess; // synthesis across channels — admin/client only
  const { user } = useAuth();
  const isDebraj =
    user?.id === DEBRAJ_USER_ID ||
    (user?.email?.toLowerCase() === "debraj@vsavetmedia.ca");
  const [clinic, setClinic] = useState<ClinicData | null>(null);
  const [creds, setCreds] = useState<ClinicCredentials>({
    meta_page_id: null, meta_instagram_business_id: null, meta_page_name: null, meta_granted_scopes: null,
    google_ads_customer_id: null, google_ads_login_customer_id: null, google_ads_account_name: null,
    last_meta_sync_at: null, last_google_sync_at: null,
    gbp_account_id: null, gbp_location_id: null, gbp_location_name: null, gbp_connected_at: null,
  });
  const [gbpLocations, setGbpLocations] = useState<{ locations: any[]; refresh_token: string } | null>(null);
  
  const [instaData, setInstaData] = useState<any[]>([]);
  const [fbData, setFbData] = useState<any[]>([]);
  const [googleAdsData, setGoogleAdsData] = useState<any[]>([]);
  const [metaPages, setMetaPages] = useState<any[] | null>(null);
  const [googleAccounts, setGoogleAccounts] = useState<{ accounts: any[]; refresh_token: string } | null>(null);
  const [ga4Picker, setGa4Picker] = useState<{ properties: GA4Property[]; refresh_token: string } | null>(null);
  const [gscPicker, setGscPicker] = useState<{ sites: GSCSite[]; refresh_token: string } | null>(null);
  const [teamMembers, setTeamMembers] = useState<{ full_name: string | null; team_role: string | null }[]>([]);

  // Determine initial tab based on OAuth URL params
  const hasOAuthParams = searchParams.has("google") || searchParams.has("meta") || searchParams.has("google_token_ref") || searchParams.has("meta_token_ref") || searchParams.has("gbp_token_ref") || searchParams.has("ga4_token_ref") || searchParams.has("gsc_token_ref");
  const [activeTab, setActiveTab] = useState(hasOAuthParams ? "connections" : "instagram");

  // Snap back to a permitted tab if user lands on a hidden one (e.g. concierge)
  useEffect(() => {
    if (activeTab === "google" && !canSeeGoogleAds) setActiveTab("instagram");
    if (activeTab === "ai" && !canSeeAIInsights) setActiveTab("instagram");
  }, [activeTab, canSeeGoogleAds, canSeeAIInsights]);

  const [metaScopes, setMetaScopes] = useState<string[]>([]);

  const fetchOAuthData = async (tokenRef: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("retrieve-oauth-data", {
        body: { token_id: tokenRef },
      });
      if (error || !data) {
        console.error("Failed to retrieve OAuth data:", error);
        const msg = error ? await extractEdgeFunctionError(error, data, "Failed to retrieve OAuth data") : "Failed to retrieve OAuth data. The link may have expired.";
        toast.error(msg);
        return null;
      }
      return data;
    } catch (e) {
      console.error("OAuth data fetch error:", e);
      toast.error("Failed to retrieve OAuth data.");
      return null;
    }
  };

  useEffect(() => {
    if (!id) return;
    (supabase.from("clinics" as any).select("clinic_name, website, timezone, logo_url, website_enabled, seo_enabled, google_ads_enabled, ai_seo_enabled, social_media_enabled").eq("id", id).maybeSingle() as any).then(({ data }: { data: ClinicData | null }) => {
      setClinic(data);
    });
    fetchCredentials();
    fetchAnalytics();
    fetchTeamMembers();

    // Handle ?google=connected (single-account auto-connect)
    if (searchParams.get("google") === "connected") {
      setActiveTab("connections");
      toast.success("Google Ads account connected successfully!");
      fetchCredentials();
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("google");
      setSearchParams(newParams, { replace: true });
    }

    // Handle Google OAuth error params
    const googleError = searchParams.get("error");
    if (googleError) {
      setActiveTab("connections");
      const errorMessages: Record<string, string> = {
        oauth_denied: "Google authorization was denied. Please try again.",
        token_exchange: "Failed to exchange authorization code. Please reconnect.",
        no_refresh_token: "Google did not provide a refresh token. Please revoke access at myaccount.google.com/permissions and try again.",
        list_customers: "Could not retrieve your Google Ads accounts. Ensure your account has active Google Ads access.",
        list_properties: "Could not retrieve your GA4 properties. Make sure the Google account has access to a GA4 property.",
        list_sites: "Could not retrieve Search Console sites. Enable the Google Search Console API in Google Cloud, wait a few minutes, then reconnect.",
        no_accounts: "No Google Ads accounts found for this Google account.",
        no_properties: "No GA4 properties found for this Google account.",
        no_sites: "Google connected, but this account has no verified Search Console properties. Add the clinic website in Google Search Console or reconnect with an account that already has access.",
        token_store: "Failed to store OAuth data. Please try again.",
      };
      toast.error(errorMessages[googleError] || `Google connection failed: ${googleError}`);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("error");
      setSearchParams(newParams, { replace: true });
    }

    // Handle ?meta=connected (single-page auto-connect)
    if (searchParams.get("meta") === "connected") {
      setActiveTab("connections");
      toast.success("Facebook Page connected successfully!");
      fetchCredentials();
      fetchAnalytics();
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("meta");
      setSearchParams(newParams, { replace: true });
    }

    // Check for meta_token_ref URL parameter (secure token reference after OAuth)
    const metaTokenRef = searchParams.get("meta_token_ref");
    if (metaTokenRef) {
      setActiveTab("connections");
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("meta_token_ref");
      setSearchParams(newParams, { replace: true });
      fetchOAuthData(metaTokenRef).then((result) => {
        if (result?.payload?.pages) {
          setMetaPages(result.payload.pages);
          if (Array.isArray(result.payload.granted_scopes)) {
            setMetaScopes(result.payload.granted_scopes);
          }
        }
      });
    }

    // Check for google_token_ref URL parameter (secure token reference after OAuth)
    const googleTokenRef = searchParams.get("google_token_ref");
    if (googleTokenRef) {
      setActiveTab("connections");
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("google_token_ref");
      setSearchParams(newParams, { replace: true });
      fetchOAuthData(googleTokenRef).then((result) => {
        if (result?.payload) {
          setGoogleAccounts(result.payload);
        }
      });
    }

    // Check for gbp_token_ref URL parameter
    const gbpTokenRef = searchParams.get("gbp_token_ref");
    if (gbpTokenRef) {
      setActiveTab("connections");
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("gbp_token_ref");
      setSearchParams(newParams, { replace: true });
      fetchOAuthData(gbpTokenRef).then((result) => {
        if (result?.payload) {
          setGbpLocations(result.payload);
        }
      });
    }

    // Check for ga4_token_ref URL parameter
    const ga4TokenRef = searchParams.get("ga4_token_ref");
    if (ga4TokenRef) {
      setActiveTab("connections");
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("ga4_token_ref");
      setSearchParams(newParams, { replace: true });
      fetchOAuthData(ga4TokenRef).then((result) => {
        if (result?.payload?.properties) {
          setGa4Picker({ properties: result.payload.properties, refresh_token: result.payload.refresh_token });
        }
      });
    }

    // Check for gsc_token_ref URL parameter
    const gscTokenRef = searchParams.get("gsc_token_ref");
    if (gscTokenRef) {
      setActiveTab("connections");
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("gsc_token_ref");
      setSearchParams(newParams, { replace: true });
      fetchOAuthData(gscTokenRef).then((result) => {
        if (result?.payload?.sites) {
          setGscPicker({ sites: result.payload.sites, refresh_token: result.payload.refresh_token });
        }
      });
    }

  }, [id]);

  const fetchCredentials = async () => {
    if (!id) return;
    const { data } = await supabase.from("clinic_api_credentials")
      .select("meta_page_id, meta_instagram_business_id, meta_page_name, meta_granted_scopes, google_ads_customer_id, google_ads_login_customer_id, google_ads_account_name, last_meta_sync_at, last_google_sync_at, gbp_account_id, gbp_location_id, gbp_location_name, gbp_connected_at")
      .eq("clinic_id", id).maybeSingle();
    if (data) setCreds(data as ClinicCredentials);
  };

  const updateClinicAccess = async (key: ClinicAccessKey, checked: boolean) => {
    if (!id || !clinic) return;

    const previousValue = clinic[key] ?? (key === "ai_seo_enabled" ? false : true);
    setClinic((prev) => (prev ? { ...prev, [key]: checked } : prev));

    const { error } = await (supabase
      .from("clinics" as any)
      .update({ [key]: checked } as any)
      .eq("id", id) as any);

    if (error) {
      setClinic((prev) => (prev ? { ...prev, [key]: previousValue } : prev));
      toast.error("Failed to update clinic service access", { description: describeError(error) });
      return;
    }

    const label = clinicAccessRows.find((row) => row.key === key)?.label || "Service";
    toast.success(`${label} ${checked ? "enabled" : "disabled"} for this clinic`);
  };

  const fetchAnalytics = async () => {
    if (!id) return;
    const { data } = await supabase.from("analytics").select("*").eq("clinic_id", id).order("recorded_at", { ascending: true });
    if (!data) return;
    const insta = data.filter(r => r.platform === "instagram").map(r => {
      const m = (r as any).metrics_json || {};
      return {
        month: (r as any).date || r.recorded_at?.slice(0, 7),
        followers: m.followers, reach: m.reach, impressions: m.impressions,
        engagement: m.engagement, media_count: m.media_count,
      };
    });
    const fb = data.filter(r => r.platform === "facebook").map(r => {
      const m = (r as any).metrics_json || {};
      return {
        month: (r as any).date || r.recorded_at?.slice(0, 7),
        likes: m.likes, followers: m.followers, reach: m.reach, reach_unique: m.reach_unique,
        engagement: m.engagement, post_engagements: m.post_engagements,
        page_views: m.page_views, fan_adds: m.fan_adds, fan_removes: m.fan_removes,
        video_views: m.video_views, talking_about: m.talking_about,
        daily_trends: m.daily_trends, recent_posts: m.recent_posts,
        reactions: m.reactions,
      };
    });
    const gAds = data.filter(r => r.platform === "google_ads").map(r => {
      const m = (r as any).metrics_json || {};
      return { ...m, date: (r as any).date || r.recorded_at?.slice(0, 7) };
    });
    setInstaData(insta);
    setFbData(fb);
    setGoogleAdsData(gAds);
  };


  const fetchTeamMembers = async () => {
    if (!id) return;
    const { data: assignments } = await (supabase.from("clinic_team_members" as any).select("user_id").eq("clinic_id", id) as any);
    if (!assignments || assignments.length === 0) { setTeamMembers([]); return; }
    const userIds = assignments.map((a: any) => a.user_id);
    const { data: profiles } = await supabase.from("profiles").select("full_name, team_role").in("id", userIds);
    setTeamMembers(profiles || []);
  };




  const hasGoogleCreds = !!creds.google_ads_customer_id;

  const EmptyState = ({ message }: { message: string }) => (
    <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">{message}</p></CardContent></Card>
  );

  const latestInsta = instaData.length > 0 ? instaData[instaData.length - 1] : null;
  const latestFb = fbData.length > 0 ? fbData[fbData.length - 1] : null;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
          <Link to="/clinics"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
          {id && (
            <ClinicLogoUploader
              clinicId={id}
              clinicName={clinic?.clinic_name || ""}
              logoUrl={clinic?.logo_url ?? null}
              onChange={(url) => setClinic((prev) => (prev ? { ...prev, logo_url: url } : prev))}
              size={72}
            />
          )}
          <div>
            <h1 className="text-[28px] sm:text-[34px] font-bold text-foreground tracking-tight leading-tight">{clinic?.clinic_name || "Loading..."}</h1>
            <p className="text-muted-foreground mt-1 text-sm">Clinic Analytics & Performance</p>
          </div>
        </div>

        {/* Team Members */}
        {teamMembers.length > 0 && (
          <Card className="border-border/60">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Team:
                </div>
                {teamMembers.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {(m.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{m.full_name || "Unknown"}</span>
                    {m.team_role && <Badge variant="secondary" className="text-[10px] rounded-full">{m.team_role}</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-secondary w-full justify-start overflow-x-auto flex-nowrap tabs-scroll">
            <TabsTrigger value="instagram">Instagram</TabsTrigger>
            <TabsTrigger value="facebook">Facebook</TabsTrigger>
            {canSeeGoogleAds && <TabsTrigger value="google">Google Ads</TabsTrigger>}
            {canSeeAIInsights && <TabsTrigger value="ai">Tony AI Insights</TabsTrigger>}
            {(role === "admin" || isDebraj) && <TabsTrigger value="connections">Connections</TabsTrigger>}
          </TabsList>

          <TabsContent value="instagram" className="space-y-4 mt-4">
            {instaData.length === 0 ? (
              <EmptyState message="No Instagram data yet - connect your account and sync from the Connections tab." />
            ) : (
              <>
                {/* Insight Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FacebookInsightCard
                    title="Followers"
                    mainValue={latestInsta?.followers?.toLocaleString() ?? "—"}
                    mainLabel="Total followers"
                    sparklineData={instaData.length > 1 ? instaData.map((d: any) => ({ value: d.followers ?? 0 })) : undefined}
                    subMetrics={[
                      { label: "Media posts", value: latestInsta?.media_count?.toLocaleString() ?? "—" },
                    ]}
                  />
                  <FacebookInsightCard
                    title="Reach"
                    mainValue={latestInsta?.reach?.toLocaleString() ?? "—"}
                    mainLabel="Accounts reached (28 days)"
                    sparklineData={instaData.length > 1 ? instaData.map((d: any) => ({ value: d.reach ?? 0 })) : undefined}
                    subMetrics={[
                      { label: "Impressions", value: latestInsta?.impressions?.toLocaleString() ?? "—" },
                    ]}
                  />
                  <FacebookInsightCard
                    title="Engagement"
                    mainValue={latestInsta?.engagement ? `${latestInsta.engagement}%` : "—"}
                    mainLabel="Avg. engagement rate"
                  />
                  <FacebookInsightCard
                    title="Impressions"
                    mainValue={latestInsta?.impressions?.toLocaleString() ?? "—"}
                    mainLabel="Total impressions (28 days)"
                    sparklineData={instaData.length > 1 ? instaData.map((d: any) => ({ value: d.impressions ?? 0 })) : undefined}
                  />
                </div>

                {/* Followers Growth Chart */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Followers Growth</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={instaData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip />
                        <Area type="monotone" dataKey="followers" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} name="Followers" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Reach & Impressions Chart */}
                {instaData.length > 1 && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Reach & Impressions Over Time</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={instaData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <Tooltip />
                          <Bar dataKey="reach" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Reach" />
                          <Bar dataKey="impressions" fill="hsl(var(--accent-foreground))" radius={[4, 4, 0, 0]} name="Impressions" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="facebook" className="space-y-4 mt-4">
            {fbData.length === 0 ? (
              <EmptyState message="No Facebook data yet - connect your account and sync from the Connections tab." />
            ) : (
              <>
                {/* Insight Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FacebookInsightCard
                    title="Views"
                    mainValue={latestFb?.reach?.toLocaleString() ?? "—"}
                    mainLabel="Page impressions (28 days)"
                    sparklineData={latestFb?.daily_trends?.map((d: any) => ({ value: d.impressions ?? 0 }))}
                    subMetrics={[
                      { label: "Unique reach", value: latestFb?.reach_unique?.toLocaleString() ?? "—" },
                      { label: "Video views", value: latestFb?.video_views?.toLocaleString() ?? "—" },
                    ]}
                  />
                  <FacebookInsightCard
                    title="Interactions"
                    mainValue={latestFb?.post_engagements?.toLocaleString() ?? "—"}
                    mainLabel="Post engagements (28 days)"
                    sparklineData={latestFb?.daily_trends?.map((d: any) => ({ value: d.engaged_users ?? 0 }))}
                    subMetrics={[
                      { label: "Engaged users", value: latestFb?.engagement?.toLocaleString() ?? "—" },
                      { label: "Talking about", value: latestFb?.talking_about?.toLocaleString() ?? "—" },
                    ]}
                  />
                  <FacebookInsightCard
                    title="Visits"
                    mainValue={latestFb?.page_views?.toLocaleString() ?? "—"}
                    mainLabel="Page views (28 days)"
                    sparklineData={latestFb?.daily_trends?.map((d: any) => ({ value: d.page_views ?? 0 }))}
                  />
                  <FacebookInsightCard
                    title="Follows"
                    mainValue={`+${latestFb?.fan_adds?.toLocaleString() ?? "0"}`}
                    mainLabel={`Total followers: ${latestFb?.followers?.toLocaleString() ?? "—"}`}
                    sparklineData={latestFb?.daily_trends?.map((d: any) => ({ value: (d.fan_adds ?? 0) - (d.fan_removes ?? 0) }))}
                    subMetrics={[
                      { label: "New follows", value: `+${latestFb?.fan_adds ?? 0}`, color: "primary" },
                      { label: "Unfollows", value: `-${latestFb?.fan_removes ?? 0}`, color: "destructive" },
                      { label: "Net follows", value: (latestFb?.fan_adds ?? 0) - (latestFb?.fan_removes ?? 0), color: "primary" },
                    ]}
                  />
                </div>

                {/* Daily Trends Chart */}
                {latestFb?.daily_trends && latestFb.daily_trends.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Daily Impressions & Engagement (Last 30 Days)</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={latestFb.daily_trends}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v: string) => v ? format(new Date(v), "MMM d") : ""} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                          <Tooltip labelFormatter={(v: string) => v ? format(new Date(v), "MMM d, yyyy") : ""} />
                          <Area type="monotone" dataKey="impressions" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} name="Impressions" />
                          <Area type="monotone" dataKey="engaged_users" stroke="hsl(var(--accent-foreground))" fill="hsl(var(--accent) / 0.15)" strokeWidth={2} name="Engaged Users" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Page Views Trend */}
                {latestFb?.daily_trends && latestFb.daily_trends.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Daily Page Views</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={latestFb.daily_trends}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v: string) => v ? format(new Date(v), "MMM d") : ""} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                          <Tooltip labelFormatter={(v: string) => v ? format(new Date(v), "MMM d, yyyy") : ""} />
                          <Bar dataKey="page_views" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Page Views" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Posts */}
                {latestFb?.recent_posts && latestFb.recent_posts.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-base">Recent Posts Performance</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {latestFb.recent_posts.map((post: any, i: number) => (
                          <div key={post.id || i} className="flex items-start gap-4 p-3 rounded-lg border border-border">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{post.message || "(No text)"}</p>
                              <p className="text-xs text-muted-foreground mt-1">{post.created_time ? format(new Date(post.created_time), "MMM d, yyyy h:mm a") : ""}</p>
                            </div>
                            <div className="flex gap-4 text-xs text-muted-foreground shrink-0">
                              <span>👍 {post.likes}</span>
                              <span>💬 {post.comments}</span>
                              <span>🔄 {post.shares}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="google" className="space-y-4 mt-4">
            {googleAdsData.length === 0 ? (
              <EmptyState message="No Google Ads data yet - connect your account and sync from the Connections tab." />
            ) : (
              <>
                {/* KPI Cards */}
                {(() => {
                  const latest = googleAdsData[googleAdsData.length - 1];
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FacebookInsightCard title="Clicks" mainValue={latest?.clicks?.toLocaleString() ?? "—"} mainLabel="Total clicks (30 days)" />
                      <FacebookInsightCard title="Impressions" mainValue={latest?.impressions?.toLocaleString() ?? "—"} mainLabel="Total impressions (30 days)" />
                      <FacebookInsightCard title="Cost" mainValue={latest?.cost != null ? `$${latest.cost.toFixed(2)}` : "—"} mainLabel="Total spend (30 days)" />
                      <FacebookInsightCard title="Conversions" mainValue={latest?.conversions?.toLocaleString() ?? "—"} mainLabel="Total conversions (30 days)" />
                    </div>
                  );
                })()}

                {/* Campaign Breakdown */}
                {(() => {
                  const latest = googleAdsData[googleAdsData.length - 1];
                  const campaigns = latest?.campaigns || [];
                  if (campaigns.length === 0) return null;
                  return (
                    <Card>
                      <CardHeader><CardTitle className="text-base">Campaign Breakdown</CardTitle></CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-left text-muted-foreground">
                                <th className="pb-2 font-medium">Campaign</th>
                                <th className="pb-2 font-medium text-right">Clicks</th>
                                <th className="pb-2 font-medium text-right">Impressions</th>
                                <th className="pb-2 font-medium text-right">Cost</th>
                                <th className="pb-2 font-medium text-right">Conversions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {campaigns.map((c: any, i: number) => (
                                <tr key={i} className="border-b border-border/50">
                                  <td className="py-2 text-foreground">{c.name}</td>
                                  <td className="py-2 text-right text-foreground">{c.clicks?.toLocaleString()}</td>
                                  <td className="py-2 text-right text-foreground">{c.impressions?.toLocaleString()}</td>
                                  <td className="py-2 text-right text-foreground">${c.cost?.toFixed(2)}</td>
                                  <td className="py-2 text-right text-foreground">{c.conversions?.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Daily Trends */}
                {(() => {
                  const latest = googleAdsData[googleAdsData.length - 1];
                  const dailyTrends = latest?.daily_trends || [];
                  if (dailyTrends.length === 0) return null;
                  return (
                    <>
                      <Card>
                        <CardHeader><CardTitle className="text-base">Clicks & Impressions (Last 30 Days)</CardTitle></CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={dailyTrends}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v: string) => v ? format(new Date(v), "MMM d") : ""} />
                              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                              <Tooltip labelFormatter={(v: string) => v ? format(new Date(v), "MMM d, yyyy") : ""} />
                              <Area type="monotone" dataKey="impressions" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} name="Impressions" />
                              <Area type="monotone" dataKey="clicks" stroke="hsl(var(--accent-foreground))" fill="hsl(var(--accent) / 0.15)" strokeWidth={2} name="Clicks" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader><CardTitle className="text-base">Daily Spend</CardTitle></CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={dailyTrends}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v: string) => v ? format(new Date(v), "MMM d") : ""} />
                              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v: number) => `$${v}`} />
                              <Tooltip labelFormatter={(v: string) => v ? format(new Date(v), "MMM d, yyyy") : ""} formatter={(v: number) => [`$${v.toFixed(2)}`, "Cost"]} />
                              <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Cost" />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    </>
                  );
                })()}
              </>
            )}
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-base">Tony AI Monthly Insights</CardTitle>
                <Button variant="outline" size="sm" className="w-full sm:w-auto shrink-0"><RefreshCw className="h-4 w-4 mr-1" /> Regenerate</Button>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-foreground leading-relaxed">
                <p className="text-muted-foreground">
                  {instaData.length > 0 || fbData.length > 0 || googleAdsData.length > 0
                    ? "Sync your data and regenerate insights to get an up-to-date Tony AI analysis."
                    : "No analytics data available yet. Connect accounts and sync data first."}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {(role === "admin" || isDebraj) && (
            <TabsContent value="connections" className="space-y-4 mt-4">
              <MetaConnectionCard
                clinicId={id!}
                hasMetaCreds={!!creds.meta_page_id}
                metaPageName={(creds as any).meta_page_name || null}
                metaPageId={creds.meta_page_id}
                metaInstagramBusinessId={creds.meta_instagram_business_id}
                lastMetaSyncAt={creds.last_meta_sync_at}
                grantedScopes={creds.meta_granted_scopes}
                onRefresh={() => { fetchCredentials(); fetchAnalytics(); }}
              />
              <GoogleAdsConnectionCard
                clinicId={id!}
                hasGoogleCreds={hasGoogleCreds}
                accountName={(creds as any).google_ads_account_name || null}
                customerId={creds.google_ads_customer_id}
                lastGoogleSyncAt={creds.last_google_sync_at}
                onRefresh={() => { fetchCredentials(); fetchAnalytics(); }}
              />
              <GBPConnectionCard
                clinicId={id!}
                hasGbpCreds={!!creds.gbp_account_id}
                locationName={creds.gbp_location_name}
                locationId={creds.gbp_location_id}
                connectedAt={creds.gbp_connected_at}
                onRefresh={() => { fetchCredentials(); }}
              />
              <GA4ConnectionCard clinicId={id!} />
              <GSCConnectionCard clinicId={id!} />

              
              {(role === "admin" || isDebraj) && <TrackingSetupCard clinicId={id!} />}
              {(role === "admin" || isDebraj) && <CtaTrackingSetupCard clinicId={id!} />}
              {(role === "admin" || isDebraj) && <SearchAtlasSetupCard clinicId={id!} />}

              {/* Website URL Card */}
              {(role === "admin" || isDebraj) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      Website URL
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <WebsiteUrlField
                      clinicId={id!}
                      currentUrl={clinic?.website || ""}
                      onSaved={(url) => setClinic((prev) => prev ? { ...prev, website: url } : prev)}
                    />
                  </CardContent>
                </Card>
              )}

              {(role === "admin" || isDebraj) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      Clinic Timezone
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TimezoneField
                      clinicId={id!}
                      currentTimezone={clinic?.timezone ?? DEFAULT_CLINIC_TIMEZONE}
                      onSaved={(timezone) => setClinic((prev) => prev ? { ...prev, timezone } : prev)}
                    />
                  </CardContent>
                </Card>
              )}
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Service Access
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {clinicAccessRows.map((service) => {
                    const checked = clinic ? (clinic[service.key] ?? (service.key === "ai_seo_enabled" ? false : true)) : false;

                    return (
                      <div key={service.key} className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                        <div>
                          <Label className="text-sm font-medium">{service.label}</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
                        </div>
                        <Switch checked={checked} onCheckedChange={(nextChecked) => updateClinicAccess(service.key, nextChecked)} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        {metaPages && id && (
          <PageSelectionDialog
            open={!!metaPages}
            pages={metaPages}
            clinicId={id}
            grantedScopes={metaScopes}
            onClose={() => {
              setMetaPages(null);
              setSearchParams({}, { replace: true });
            }}
            onConnected={() => {
              setMetaPages(null);
              setSearchParams({}, { replace: true });
              fetchCredentials();
              fetchAnalytics();
            }}
          />
        )}

        {googleAccounts && id && (
          <GoogleAccountSelectionDialog
            open={!!googleAccounts}
            accounts={googleAccounts.accounts}
            refreshToken={googleAccounts.refresh_token}
            clinicId={id}
            clinicName={clinic?.clinic_name || ""}
            onClose={() => {
              setGoogleAccounts(null);
              setSearchParams({}, { replace: true });
            }}
            onConnected={() => {
              setGoogleAccounts(null);
              setSearchParams({}, { replace: true });
              fetchCredentials();
              fetchAnalytics();
            }}
          />
        )}

        {gbpLocations && id && (
          <GBPLocationSelectionDialog
            open={!!gbpLocations}
            locations={gbpLocations.locations}
            refreshToken={gbpLocations.refresh_token}
            clinicId={id}
            clinicName={clinic?.clinic_name || ""}
            onClose={() => {
              setGbpLocations(null);
              setSearchParams({}, { replace: true });
            }}
            onConnected={() => {
              setGbpLocations(null);
              setSearchParams({}, { replace: true });
              fetchCredentials();
            }}
          />
        )}

        {ga4Picker && id && (
          <GA4PropertySelectionDialog
            open={!!ga4Picker}
            properties={ga4Picker.properties}
            refreshToken={ga4Picker.refresh_token}
            clinicId={id}
            clinicName={clinic?.clinic_name || ""}
            onClose={() => { setGa4Picker(null); setSearchParams({}, { replace: true }); }}
            onConnected={() => { setGa4Picker(null); setSearchParams({}, { replace: true }); }}
          />
        )}

      </div>
    </>
  );
}
