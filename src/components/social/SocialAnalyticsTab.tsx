import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend } from "recharts";
import { RefreshCw, Loader2, AlertTriangle, CheckCircle2, ExternalLink, Heart, MessageCircle, Share2, Bookmark, Eye, TrendingUp, Users, Activity, Image as ImageIcon } from "lucide-react";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";

interface Props { clinicId?: string | null }

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.75rem",
  fontSize: "13px",
};

function StatusDot({ status }: { status: string }) {
  const color = status === "ok" ? "bg-success" : status === "missing" ? "bg-warning" : "bg-muted-foreground/40";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function num(n: number | undefined | null) {
  if (n == null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function KPI({ label, value, icon: Icon, sublabel }: { label: string; value: string | number; icon: any; sublabel?: string }) {
  return (
    <Card className="hover-lift">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-1">{typeof value === "number" ? num(value) : value}</p>
            {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
          </div>
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SocialAnalyticsTab({ clinicId }: Props) {
  const { role } = useUserRole();
  const isStaff = role === "admin" || role === "concierge";
  // Only admins can read clinic_api_credentials per RLS; concierges fall back to data-presence detection
  const canReadCreds = role === "admin";
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [fb, setFb] = useState<any>(null);
  const [ig, setIg] = useState<any>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [perms, setPerms] = useState<any>(null);
  const [hasMeta, setHasMeta] = useState(false);

  const load = async () => {
    if (!clinicId) { setLoading(false); return; }
    setLoading(true);

    // Credentials table is admin-only via RLS; skip for concierge/clients
    if (canReadCreds) {
      const { data: creds } = await supabase
        .from("clinic_api_credentials")
        .select("meta_page_id, last_meta_sync_at")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      setHasMeta(!!creds?.meta_page_id);
      setLastSync(creds?.last_meta_sync_at || null);
    } else {
      // For concierge/clients: assume connected; will fall back if no analytics rows
      setHasMeta(true);
    }

    const { data } = await supabase
      .from("analytics")
      .select("*")
      .eq("clinic_id", clinicId)
      .in("platform", ["facebook", "instagram"])
      .order("recorded_at", { ascending: false })
      .limit(20);

    const fbRow = data?.find((r: any) => r.platform === "facebook");
    const igRow = data?.find((r: any) => r.platform === "instagram");
    setFb(fbRow?.metrics_json || null);
    setIg(igRow?.metrics_json || null);

    // For non-admin with no analytics data, fall back to "not connected" empty state
    if (!canReadCreds && !fbRow && !igRow) setHasMeta(false);

    setLoading(false);
  };

  useEffect(() => { load(); }, [clinicId, isStaff]);

  const handleSync = async () => {
    if (!clinicId) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("sync-meta-analytics", {
        body: { clinic_id: clinicId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractEdgeFunctionError(res.error, res.data, "Sync failed"));
      setPerms(res.data?.permissions_status || null);
      toast.success("Analytics synced");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading analytics...</div>;
  }

  if (!hasMeta) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium text-foreground">Meta not connected</p>
          <p className="text-sm mt-1">Connect a Facebook Page from the clinic settings to see analytics.</p>
        </CardContent>
      </Card>
    );
  }

  const missingPerms = perms ? Object.entries(perms).filter(([_, v]) => v === "missing") : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Social Analytics</h2>
          {isStaff && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{lastSync ? `Last synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}` : "Not synced yet"}</span>
              <Badge variant="outline" className="text-[10px]">Auto-sync: Daily 07:30 UTC</Badge>
            </div>
          )}
        </div>
        {isStaff && (
          <Button onClick={handleSync} disabled={syncing} size="sm">
            {syncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Sync Now
          </Button>
        )}
      </div>

      {missingPerms.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some metrics are unavailable</AlertTitle>
          <AlertDescription className="text-xs space-y-2">
            <p>The connected Page admin must be added as an <strong>App Tester</strong> in your Meta App Dashboard (App Roles → Roles), then reconnect Meta. Missing scopes:</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {missingPerms.map(([k]) => <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>)}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="facebook" disabled={!fb}>Facebook</TabsTrigger>
          <TabsTrigger value="instagram" disabled={!ig}>Instagram</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI label="FB Followers" value={fb?.followers || 0} icon={Users} />
            <KPI label="IG Followers" value={ig?.followers || 0} icon={Users} sublabel={ig?.username ? `@${ig.username}` : undefined} />
            <KPI label="Total Reach (28d)" value={(fb?.reach || 0) + (ig?.reach || 0)} icon={TrendingUp} />
            <KPI label="Engagement (28d)" value={(fb?.engagement || 0) + (ig?.accounts_engaged || 0)} icon={Activity} />
          </div>

          {fb?.daily_trends?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Facebook · 30-Day Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={fb.daily_trends}>
                    <defs>
                      <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" name="Impressions" dataKey="impressions" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#reachGrad)" />
                    <Area type="monotone" name="Engaged Users" dataKey="engaged_users" stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#engGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* FACEBOOK */}
        <TabsContent value="facebook" className="mt-4 space-y-5">
          {fb && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPI label="Page Likes" value={fb.likes} icon={Heart} />
                <KPI label="Followers" value={fb.followers} icon={Users} />
                <KPI label="Reach (28d)" value={fb.reach} icon={TrendingUp} sublabel={`${num(fb.reach_unique)} unique`} />
                <KPI label="Engagement" value={fb.engagement} icon={Activity} sublabel={`${num(fb.post_engagements)} on posts`} />
                <KPI label="Page Views" value={fb.page_views} icon={Eye} />
                <KPI label="Video Views" value={fb.video_views} icon={Eye} />
                <KPI label="New Fans" value={fb.fan_adds} icon={TrendingUp} sublabel={`${num(fb.fan_removes)} unfollows`} />
                <KPI label="Talking About" value={fb.talking_about} icon={MessageCircle} />
              </div>

              {fb.recent_posts?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Recent Posts</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {fb.recent_posts.map((p: any) => (
                      <div key={p.id} className="flex gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition-colors">
                        {p.picture && <img src={p.picture} alt="" className="h-16 w-16 rounded object-cover shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground line-clamp-2">{p.message || <span className="italic text-muted-foreground">No caption</span>}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span>{new Date(p.created_time).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{num(p.likes)}</span>
                            <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{num(p.comments)}</span>
                            <span className="flex items-center gap-1"><Share2 className="h-3 w-3" />{num(p.shares)}</span>
                            {p.post_impressions !== undefined && <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{num(p.post_impressions)}</span>}
                            {p.post_engaged_users !== undefined && <span className="flex items-center gap-1"><Activity className="h-3 w-3" />{num(p.post_engaged_users)} engaged</span>}
                            {p.permalink && <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5"><ExternalLink className="h-3 w-3" />View</a>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* INSTAGRAM */}
        <TabsContent value="instagram" className="mt-4 space-y-5">
          {ig && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPI label="Followers" value={ig.followers} icon={Users} sublabel={ig.username ? `@${ig.username}` : undefined} />
                <KPI label="Posts" value={ig.media_count} icon={ImageIcon} />
                <KPI label="Reach" value={ig.reach} icon={TrendingUp} />
                <KPI label="Engagement Rate" value={`${ig.engagement_rate}%`} icon={Activity} />
                <KPI label="Profile Views" value={ig.profile_views} icon={Eye} />
                <KPI label="Website Clicks" value={ig.website_clicks} icon={ExternalLink as any} />
                <KPI label="Total Interactions" value={ig.total_interactions} icon={Heart} />
                <KPI label="Saves" value={ig.saves} icon={Bookmark} />
              </div>

              {ig.recent_media?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Recent Posts</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {ig.recent_media.map((m: any) => (
                        <a key={m.id} href={m.permalink} target="_blank" rel="noopener noreferrer" className="block group">
                          <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                            {m.thumbnail_url && <img src={m.thumbnail_url} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white text-[11px] flex justify-between">
                              <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{num(m.likes)}</span>
                              <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{num(m.comments)}</span>
                              {m.reach !== undefined && <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{num(m.reach)}</span>}
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{m.caption || "—"}</p>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {ig.online_followers && Object.keys(ig.online_followers).length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Best Times to Post (Followers Online)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={Object.entries(ig.online_followers).map(([h, v]) => ({ hour: `${h}h`, online: v as number }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} interval={1} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="online" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {ig.stories?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Stories (24h)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {ig.stories.map((s: any) => (
                        <a key={s.id} href={s.permalink} target="_blank" rel="noopener noreferrer" className="block">
                          <div className="aspect-[9/16] rounded-lg overflow-hidden bg-muted">
                            {s.thumbnail_url && <img src={s.thumbnail_url} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
                            <span>{num(s.reach || 0)} reach</span>
                            <span>{num(s.replies || 0)} replies</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* AUDIENCE */}
        <TabsContent value="audience" className="mt-4 space-y-5">
          {(fb?.demographics || ig?.demographics) ? (
            <>
              {fb?.demographics?.gender_age && Object.keys(fb.demographics.gender_age).length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Facebook · Gender & Age</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={Object.entries(fb.demographics.gender_age).map(([k, v]) => ({ segment: k, fans: v as number }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="segment" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="fans" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {fb?.demographics?.country && Object.keys(fb.demographics.country).length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">FB · Top Countries</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(fb.demographics.country).slice(0, 8).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium tabular-nums">{num(v as number)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {fb?.demographics?.city && Object.keys(fb.demographics.city).length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">FB · Top Cities</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(fb.demographics.city).slice(0, 8).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium tabular-nums">{num(v as number)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {ig?.demographics?.country && Object.keys(ig.demographics.country).length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">IG · Top Countries</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(ig.demographics.country).slice(0, 8).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium tabular-nums">{num(v as number)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {ig?.demographics?.gender_age && Object.keys(ig.demographics.gender_age).length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">IG · Age & Gender</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(ig.demographics.gender_age).slice(0, 10).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{k}</span>
                          <span className="font-medium tabular-nums">{num(v as number)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Audience demographics will appear after the next sync (requires Page admin to be an App Tester).
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Permissions detail (collapsed footer) */}
      {perms && (
        <Card>
          <CardHeader><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Sync Status Detail</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(perms).map(([k, v]: any) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <StatusDot status={v} />
                  <span className="text-muted-foreground">{k}</span>
                  <span className="ml-auto font-medium">{v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
