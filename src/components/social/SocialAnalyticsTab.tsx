import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend, PieChart, Pie, Cell, RadialBarChart, RadialBar,
  ComposedChart, Line, LineChart,
} from "recharts";
import {
  ExternalLink, Heart, MessageCircle, Share2,
  Bookmark, Eye, TrendingUp, TrendingDown, Users, Activity, Image as ImageIcon,
  Megaphone, DollarSign, MousePointerClick, Target, Video, UserPlus, ThumbsUp,
  Facebook, Instagram, Globe, Sparkles, LayoutDashboard,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props { clinicId?: string | null }

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.75rem",
  fontSize: "12px",
  boxShadow: "0 8px 30px -12px hsl(var(--foreground) / 0.25)",
};

const axis = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
} as const;

const PALETTE = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function num(n: number | undefined | null) {
  if (n == null) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function money(n: number | undefined | null, digits = 2) {
  return `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/* ── Layout primitives ───────────────────────────────────────── */

function Panel({
  title, subtitle, icon: Icon, accent, action, className, children, dense,
}: {
  title?: string; subtitle?: string; icon?: any; accent?: string;
  action?: React.ReactNode; className?: string; children: React.ReactNode; dense?: boolean;
}) {
  return (
    <section
      className={cn(
        "relative rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden",
        className,
      )}
    >
      {accent && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      )}
      {title && (
        <header className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-border/40"
                style={accent ? { backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent } : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-[12.5px] font-semibold tracking-tight text-foreground truncate">{title}</h3>
              {subtitle && <p className="text-[10.5px] text-muted-foreground truncate">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={cn(title ? "px-4 sm:px-5 pb-4" : dense ? "p-3" : "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}

function Stat({
  label, value, caption, icon: Icon, accent, delta, index = 0,
}: {
  label: string; value: string | number; caption?: string; icon?: any;
  accent?: string; delta?: number; index?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.3, delay: Math.min(index, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className="relative min-w-0 px-3 py-3 sm:px-4"
    >
      <span aria-hidden className="pointer-events-none absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-border to-transparent" />
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 shrink-0" style={accent ? { color: accent } : undefined} />}
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground truncate">{label}</p>
      </div>
      <p className="mt-1 text-[26px] font-bold leading-none tracking-tight tabular-nums text-foreground">
        {typeof value === "number" ? num(value) : value}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        {delta !== undefined && delta !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums", delta > 0 ? "text-success" : "text-destructive")}>
            {delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {delta > 0 ? "+" : ""}{num(delta)}
          </span>
        )}
        {caption && <p className="text-[10.5px] text-muted-foreground truncate">{caption}</p>}
      </div>
    </motion.div>
  );
}

function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 }) {
  return (
    <div className={cn("grid gap-y-1 rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm", cols === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
      {children}
    </div>
  );
}

function BarRow({ label, value, max, color, suffix }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-[11.5px]">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-foreground">{num(value)}{suffix}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

function Donut({ data, unit }: { data: { name: string; value: number }[]; unit?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums leading-none">{num(total)}</span>
          <span className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">{unit || "total"}</span>
        </div>
      </div>
      <div className="w-full space-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-[11.5px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
            <span className="truncate capitalize text-muted-foreground">{d.name}</span>
            <span className="ml-auto shrink-0 font-semibold tabular-nums">{num(d.value)}</span>
            <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/70">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyPanel({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <Panel>
      <div className="py-10 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground/70">
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{body}</p>
      </div>
    </Panel>
  );
}

/* ── Main ────────────────────────────────────────────────────── */

export default function SocialAnalyticsTab({ clinicId }: Props) {
  const { role } = useUserRole();
  const isStaff = role === "admin" || role === "concierge";
  const canReadCreds = role === "admin";
  const [loading, setLoading] = useState(true);
  const [fb, setFb] = useState<any>(null);
  const [ig, setIg] = useState<any>(null);
  const [ads, setAds] = useState<any>(null);
  const [hasMeta, setHasMeta] = useState(false);

  const load = async () => {
    if (!clinicId) { setLoading(false); return; }
    setLoading(true);

    if (canReadCreds) {
      const { data: creds } = await supabase
        .from("clinic_api_credentials")
        .select("meta_page_id")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      setHasMeta(!!creds?.meta_page_id);
    } else {
      setHasMeta(true);
    }

    const { data } = await supabase
      .from("analytics")
      .select("*")
      .eq("clinic_id", clinicId)
      .in("platform", ["facebook", "instagram", "meta_ads"])
      .order("recorded_at", { ascending: false })
      .limit(30);

    const fbRow = data?.find((r: any) => r.platform === "facebook");
    const igRow = data?.find((r: any) => r.platform === "instagram");
    const adsRow = data?.find((r: any) => r.platform === "meta_ads");
    setFb(fbRow?.metrics_json || null);
    setIg(igRow?.metrics_json || null);
    setAds(adsRow?.metrics_json || null);

    if (!canReadCreds && !fbRow && !igRow) setHasMeta(false);

    setLoading(false);
  };

  useEffect(() => { load(); }, [clinicId, canReadCreds]);

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

  /* Derived views */
  const totalAudience = (fb?.followers || 0) + (ig?.followers || 0);
  const totalEngagement = (fb?.post_engagements || 0) + (ig?.total_interactions || 0);

  const channelMix = useMemo(() => {
    const rows = [
      { name: "Facebook", value: fb?.post_engagements || 0, fill: "hsl(var(--chart-1))" },
      { name: "Instagram", value: ig?.total_interactions || 0, fill: "hsl(var(--chart-4))" },
      { name: "Paid", value: ads?.clicks || 0, fill: "hsl(var(--chart-3))" },
    ].filter((r) => r.value > 0);
    return rows;
  }, [fb, ig, ads]);

  const trend = useMemo(() => {
    const fbT: any[] = fb?.daily_trends || [];
    const igT: any[] = ig?.daily_trends || [];
    const adT: any[] = ads?.daily || [];
    const map = new Map<string, any>();
    const put = (d: string, k: string, v: number) => {
      const row = map.get(d) || { date: d };
      row[k] = (row[k] || 0) + (v || 0);
      map.set(d, row);
    };
    fbT.forEach((r) => { put(r.date, "facebook", r.engagements || 0); put(r.date, "page_views", r.page_views || 0); });
    igT.forEach((r) => put(r.date, "instagram", r.reach ?? r.value ?? 0));
    adT.forEach((r) => put(r.date, "paid", r.clicks || 0));
    return [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [fb, ig, ads]);

  const followerNet = fb?.net_follower_change ?? ((fb?.fan_adds || 0) - (fb?.fan_removes || 0));

  const topPosts = useMemo(() => {
    const rows: { key: string; label: string; value: number; source: string; url?: string }[] = [];
    (fb?.recent_posts || []).forEach((p: any, i: number) => rows.push({
      key: `fb-${p.id || i}`,
      label: (p.message || "Untitled post").slice(0, 70),
      value: (p.likes || 0) + (p.comments || 0) + (p.shares || 0),
      source: "Facebook",
      url: p.permalink,
    }));
    (ig?.recent_media || []).forEach((m: any, i: number) => rows.push({
      key: `ig-${m.id || i}`,
      label: (m.caption || "Untitled post").slice(0, 70),
      value: (m.likes || 0) + (m.comments || 0),
      source: "Instagram",
      url: m.permalink,
    }));
    return rows.sort((a, b) => b.value - a.value).slice(0, 6);
  }, [fb, ig]);

  const reactionData = useMemo(
    () => Object.entries(fb?.reactions || {}).map(([k, v]) => ({ name: k, value: v as number })).filter((r) => r.value > 0),
    [fb],
  );

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
        ))}
      </div>
    );
  }

  if (!hasMeta) {
    return (
      <EmptyPanel
        icon={ImageIcon}
        title="Meta not connected"
        body="Connect a Facebook Page from the clinic connections screen to unlock organic and paid analytics for this clinic."
      />
    );
  }

  const missingPerms = perms ? Object.entries(perms).filter(([_, v]) => v === "missing") : [];

  return (
    <div className="space-y-4">
      {/* ── Command bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ring-border/40" style={{ backgroundColor: "hsl(var(--dept-social) / 0.12)", color: "hsl(var(--dept-social))" }}>
            <Gauge className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Social performance</h2>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{lastSync ? `Synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}` : "Not synced yet"}</span>
              {isStaff && <span className="hidden sm:inline">· Auto-sync daily 07:30 UTC</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium", fb ? "border-border/60 text-foreground" : "border-border/40 text-muted-foreground/60")}>
            <Facebook className="h-3 w-3" />{fb ? num(fb.followers) : "—"}
          </span>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium", ig ? "border-border/60 text-foreground" : "border-border/40 text-muted-foreground/60")}>
            <Instagram className="h-3 w-3" />{ig ? num(ig.followers) : "—"}
          </span>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium", ads ? "border-border/60 text-foreground" : "border-border/40 text-muted-foreground/60")}>
            <Megaphone className="h-3 w-3" />{ads ? money(ads.spend, 0) : "—"}
          </span>
          <Button onClick={handleSync} disabled={syncing} size="sm" variant={isStaff ? "default" : "outline"} className="gap-1.5">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isStaff ? "Sync" : "Refresh"}
          </Button>
        </div>
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
        <TabsList className="h-9 bg-muted/50 p-1">
          <TabsTrigger value="overview" className="gap-1.5 text-xs"><LayoutDashboard className="h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="facebook" disabled={!fb} className="gap-1.5 text-xs"><Facebook className="h-3.5 w-3.5" />Facebook</TabsTrigger>
          <TabsTrigger value="instagram" disabled={!ig} className="gap-1.5 text-xs"><Instagram className="h-3.5 w-3.5" />Instagram</TabsTrigger>
          <TabsTrigger value="ads" className="gap-1.5 text-xs"><Megaphone className="h-3.5 w-3.5" />Meta Ads</TabsTrigger>
          <TabsTrigger value="audience" className="gap-1.5 text-xs"><Globe className="h-3.5 w-3.5" />Audience</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <StatGrid>
            <Stat index={0} label="Total audience" value={totalAudience} icon={Users} accent="hsl(var(--chart-1))" caption={`${num(fb?.followers || 0)} FB · ${num(ig?.followers || 0)} IG`} />
            <Stat index={1} label="Engagement 28d" value={totalEngagement} icon={Activity} accent="hsl(var(--chart-2))" caption={`${num(fb?.post_engagements || 0)} FB · ${num(ig?.total_interactions || 0)} IG`} />
            <Stat index={2} label="Follower net" value={`${followerNet >= 0 ? "+" : ""}${num(followerNet)}`} icon={UserPlus} accent="hsl(var(--chart-4))" delta={followerNet} caption={`${num(fb?.fan_adds || 0)} new · ${num(fb?.fan_removes || 0)} lost`} />
            <Stat index={3} label="Ad spend 30d" value={ads ? money(ads.spend, 0) : "—"} icon={DollarSign} accent="hsl(var(--chart-3))" caption={ads ? `${num(ads.clicks)} clicks · ${(ads.ctr || 0).toFixed(2)}% CTR` : "Ads not connected"} />
            <Stat index={4} label="IG reach 28d" value={ig?.reach || 0} icon={TrendingUp} accent="hsl(var(--chart-4))" />
            <Stat index={5} label="Profile & page views" value={(fb?.page_views || 0) + (ig?.profile_views || 0)} icon={Eye} caption={`${num(fb?.page_views || 0)} FB · ${num(ig?.profile_views || 0)} IG`} />
            <Stat index={6} label="Video views" value={fb?.video_views || 0} icon={Video} caption={`${Math.round((fb?.video_view_time_ms || 0) / 60000)}m watch time`} />
            <Stat index={7} label="Engagement rate" value={ig?.engagement_rate != null ? `${ig.engagement_rate}%` : "—"} icon={Gauge} caption="Instagram, 28 days" />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="lg:col-span-2" title="Cross-channel activity" subtitle="Daily organic engagement and paid clicks" icon={Activity} accent="hsl(var(--dept-social))">
              {trend.length > 1 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={trend}>
                    <defs>
                      <linearGradient id="grad-fb" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="grad-ig" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" {...axis} minTickGap={24} />
                    <YAxis {...axis} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" name="FB engagements" dataKey="facebook" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#grad-fb)" />
                    <Area type="monotone" name="IG reach" dataKey="instagram" stroke="hsl(var(--chart-4))" strokeWidth={2} fill="url(#grad-ig)" />
                    <Bar name="Paid clicks" dataKey="paid" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} barSize={10} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-16 text-center text-xs text-muted-foreground">Daily trend data appears after the next sync.</p>
              )}
            </Panel>

            <Panel title="Channel mix" subtitle="Share of total interactions" icon={Share2} accent="hsl(var(--chart-2))">
              {channelMix.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={190}>
                    <RadialBarChart data={channelMix} innerRadius="38%" outerRadius="100%" startAngle={90} endAngle={-270}>
                      <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "hsl(var(--muted))" }} />
                      <Tooltip contentStyle={tooltipStyle} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1.5">
                    {channelMix.map((c) => (
                      <div key={c.name} className="flex items-center gap-2 text-[11.5px]">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.fill }} />
                        <span className="text-muted-foreground">{c.name}</span>
                        <span className="ml-auto font-semibold tabular-nums">{num(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-16 text-center text-xs text-muted-foreground">No interactions recorded yet.</p>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Top performing posts" subtitle="Ranked by total interactions" icon={ThumbsUp} accent="hsl(var(--chart-1))">
              {topPosts.length > 0 ? (
                <div className="space-y-3">
                  {topPosts.map((p) => (
                    <BarRow key={p.key} label={`${p.source} · ${p.label}`} value={p.value} max={topPosts[0].value} color={p.source === "Facebook" ? "hsl(var(--chart-1))" : "hsl(var(--chart-4))"} />
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-xs text-muted-foreground">No recent posts synced.</p>
              )}
            </Panel>

            <Panel title="Funnel snapshot" subtitle="From impression to action, last 30 days" icon={Target} accent="hsl(var(--chart-3))">
              <div className="space-y-3">
                {(() => {
                  const rows = [
                    { label: "Ad impressions", value: ads?.impressions || 0, color: "hsl(var(--chart-3))" },
                    { label: "Ad reach", value: ads?.reach || 0, color: "hsl(var(--chart-1))" },
                    { label: "Page & profile views", value: (fb?.page_views || 0) + (ig?.profile_views || 0), color: "hsl(var(--chart-4))" },
                    { label: "Clicks", value: (ads?.clicks || 0) + (fb?.post_totals?.clicks || 0), color: "hsl(var(--chart-2))" },
                    { label: "Results & website clicks", value: (ads?.results || 0) + (ig?.website_clicks || 0), color: "hsl(var(--chart-5))" },
                  ];
                  const max = Math.max(...rows.map((r) => r.value), 1);
                  return rows.map((r) => <BarRow key={r.label} label={r.label} value={r.value} max={max} color={r.color} />);
                })()}
              </div>
            </Panel>
          </div>
        </TabsContent>

        {/* ── FACEBOOK ── */}
        <TabsContent value="facebook" className="mt-4 space-y-4">
          {fb && (
            <>
              <StatGrid>
                <Stat index={0} label="Page likes" value={fb.likes} icon={Heart} accent="hsl(var(--chart-1))" />
                <Stat index={1} label="Followers" value={fb.followers} icon={Users} accent="hsl(var(--chart-1))" caption={fb.page_follows ? `${num(fb.page_follows)} total follows` : undefined} />
                <Stat index={2} label="Engagements 28d" value={fb.post_engagements} icon={Activity} accent="hsl(var(--chart-2))" />
                <Stat index={3} label="Page views 28d" value={fb.page_views} icon={Eye} />
                <Stat index={4} label="New follows" value={fb.fan_adds} icon={UserPlus} accent="hsl(var(--chart-2))" delta={followerNet} caption={`${num(fb.fan_removes)} unfollows`} />
                <Stat index={5} label="Video views" value={fb.video_views} icon={Video} caption={`${num(fb.video_views_unique)} unique`} />
                <Stat index={6} label="Watch time" value={`${Math.round((fb.video_view_time_ms || 0) / 60000)}m`} icon={Clock} />
                <Stat index={7} label="Avg. per post" value={fb.avg_interactions_per_post ?? 0} icon={ThumbsUp} caption={`${fb.posts_analyzed || 0} posts analysed`} />
              </StatGrid>

              <div className="grid gap-4 lg:grid-cols-3">
                <Panel className="lg:col-span-2" title="Follower growth" subtitle="Daily follows vs unfollows, 30 days" icon={UserPlus} accent="hsl(var(--chart-2))">
                  {fb.daily_trends?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <ComposedChart data={fb.daily_trends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="date" {...axis} minTickGap={24} />
                        <YAxis {...axis} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="new_follows" name="New follows" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} barSize={10} />
                        <Bar dataKey="unfollows" name="Unfollows" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} barSize={10} />
                        <Line type="monotone" dataKey="engagements" name="Engagements" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="py-16 text-center text-xs text-muted-foreground">No daily data yet.</p>
                  )}
                </Panel>

                <Panel title="Reaction mix" subtitle="Last 28 days" icon={Heart} accent="hsl(var(--chart-5))">
                  {reactionData.length > 0 ? (
                    <Donut data={reactionData} unit="reactions" />
                  ) : (
                    <p className="py-16 text-center text-xs text-muted-foreground">No reactions recorded.</p>
                  )}
                </Panel>
              </div>

              {fb.post_totals && (
                <Panel title="Post interactions" subtitle="Aggregate across analysed posts" icon={MessageCircle} accent="hsl(var(--chart-1))">
                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {(() => {
                      const rows = [
                        { label: "Likes", value: fb.post_totals.likes || 0, color: "hsl(var(--chart-1))" },
                        { label: "Comments", value: fb.post_totals.comments || 0, color: "hsl(var(--chart-2))" },
                        { label: "Shares", value: fb.post_totals.shares || 0, color: "hsl(var(--chart-4))" },
                        { label: "Clicks", value: fb.post_totals.clicks || 0, color: "hsl(var(--chart-3))" },
                      ];
                      const max = Math.max(...rows.map((r) => r.value), 1);
                      return rows.map((r) => <BarRow key={r.label} {...r} max={max} />);
                    })()}
                  </div>
                </Panel>
              )}

              {fb.reach_available === false && (
                <p className="px-1 text-[10.5px] leading-relaxed text-muted-foreground">
                  Meta retired Page-level reach, impressions and demographics in Graph API v21. Engagement,
                  follower growth, video and per-post metrics above are the full set Meta still reports.
                </p>
              )}

              {fb.recent_posts?.length > 0 && (
                <Panel title="Recent posts" subtitle={`${fb.recent_posts.length} most recent`} icon={ImageIcon} accent="hsl(var(--chart-1))">
                  <div className="divide-y divide-border/50">
                    {fb.recent_posts.map((p: any) => (
                      <div key={p.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        {p.picture ? (
                          <img
                            src={p.picture}
                            alt=""
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            className="h-14 w-14 shrink-0 rounded-xl bg-muted object-cover"
                          />
                        ) : (
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground/60"><ImageIcon className="h-4 w-4" /></span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[12.5px] text-foreground">{p.message || <span className="italic text-muted-foreground">No caption</span>}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] tabular-nums text-muted-foreground">
                            <span>{new Date(p.created_time).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{num(p.likes)}</span>
                            <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{num(p.comments)}</span>
                            <span className="flex items-center gap-1"><Share2 className="h-3 w-3" />{num(p.shares)}</span>
                            {p.post_clicks !== undefined && <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" />{num(p.post_clicks)}</span>}
                            {p.post_video_views ? <span className="flex items-center gap-1"><Video className="h-3 w-3" />{num(p.post_video_views)}</span> : null}
                            {p.permalink && <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline"><ExternalLink className="h-3 w-3" />View</a>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </TabsContent>

        {/* ── INSTAGRAM ── */}
        <TabsContent value="instagram" className="mt-4 space-y-4">
          {ig && (
            <>
              <StatGrid>
                <Stat index={0} label="Followers" value={ig.followers} icon={Users} accent="hsl(var(--chart-4))" caption={ig.username ? `@${ig.username}` : undefined} />
                <Stat index={1} label="Posts" value={ig.media_count} icon={ImageIcon} />
                <Stat index={2} label="Reach 28d" value={ig.reach} icon={TrendingUp} accent="hsl(var(--chart-4))" />
                <Stat index={3} label="Engagement rate" value={`${ig.engagement_rate}%`} icon={Gauge} accent="hsl(var(--chart-2))" />
                <Stat index={4} label="Profile views" value={ig.profile_views} icon={Eye} />
                <Stat index={5} label="Website clicks" value={ig.website_clicks} icon={MousePointerClick} accent="hsl(var(--chart-3))" />
                <Stat index={6} label="Interactions" value={ig.total_interactions} icon={Heart} accent="hsl(var(--chart-5))" />
                <Stat index={7} label="Saves" value={ig.saves} icon={Bookmark} />
              </StatGrid>

              {ig.daily_trends?.length > 1 && (
                <Panel title="Reach trend" subtitle="Daily accounts reached" icon={TrendingUp} accent="hsl(var(--chart-4))">
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={ig.daily_trends}>
                      <defs>
                        <linearGradient id="grad-igr" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--chart-4))" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(var(--chart-4))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" {...axis} minTickGap={24} />
                      <YAxis {...axis} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" name="Reach" dataKey={ig.daily_trends[0]?.reach !== undefined ? "reach" : "value"} stroke="hsl(var(--chart-4))" strokeWidth={2} fill="url(#grad-igr)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {ig.recent_media?.length > 0 && (
                  <Panel title="Top posts" subtitle="Ranked by likes and comments" icon={ThumbsUp} accent="hsl(var(--chart-4))">
                    <div className="space-y-3">
                      {(() => {
                        const rows = [...ig.recent_media]
                          .map((m: any) => ({ id: m.id, label: (m.caption || "Untitled").slice(0, 60), value: (m.likes || 0) + (m.comments || 0) }))
                          .sort((a, b) => b.value - a.value)
                          .slice(0, 6);
                        const max = rows[0]?.value || 1;
                        return rows.map((r) => <BarRow key={r.id} label={r.label} value={r.value} max={max} color="hsl(var(--chart-4))" />);
                      })()}
                    </div>
                  </Panel>
                )}

                {ig.online_followers && Object.keys(ig.online_followers).length > 0 && (
                  <Panel title="Best times to post" subtitle="Followers online by hour" icon={Clock} accent="hsl(var(--chart-3))">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={Object.entries(ig.online_followers).map(([h, v]) => ({ hour: `${h}h`, online: v as number }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="hour" {...axis} interval={1} />
                        <YAxis {...axis} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="online" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                )}
              </div>

              {ig.recent_media?.length > 0 && (
                <Panel title="Recent media" subtitle="Latest grid" icon={ImageIcon} accent="hsl(var(--chart-4))">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {ig.recent_media.map((m: any) => (
                      <a key={m.id} href={m.permalink} target="_blank" rel="noopener noreferrer" className="group block">
                        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted">
                          {m.thumbnail_url ? (
                            <img
                              src={m.thumbnail_url}
                              alt=""
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              onError={(e) => {
                                const img = e.currentTarget as HTMLImageElement;
                                img.style.display = "none";
                                const fallback = img.nextElementSibling as HTMLElement | null;
                                if (fallback) fallback.style.display = "flex";
                              }}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : null}
                          <div className="absolute inset-0 items-center justify-center text-muted-foreground/60" style={{ display: m.thumbnail_url ? "none" : "flex" }}>
                            <ImageIcon className="h-6 w-6" />
                          </div>
                          <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/70 to-transparent p-1.5 text-[10px] text-white tabular-nums">
                            <span className="flex items-center gap-0.5"><Heart className="h-2.5 w-2.5" />{num(m.likes)}</span>
                            <span className="flex items-center gap-0.5"><MessageCircle className="h-2.5 w-2.5" />{num(m.comments)}</span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </Panel>
              )}

              {ig.stories?.length > 0 && (
                <Panel title="Stories" subtitle="Active in the last 24 hours" icon={Sparkles} accent="hsl(var(--chart-5))">
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {ig.stories.map((s: any) => (
                      <a key={s.id} href={s.permalink} target="_blank" rel="noopener noreferrer" className="block">
                        <div className="aspect-[9/16] overflow-hidden rounded-xl bg-muted">
                          {s.thumbnail_url && (
                            <img
                              src={s.thumbnail_url}
                              alt=""
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
                          <span>{num(s.reach || 0)} reach</span>
                          <span>{num(s.replies || 0)} replies</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </TabsContent>

        {/* ── PAID ── */}
        <TabsContent value="ads" className="mt-4 space-y-4">
          {!ads ? (
            <EmptyPanel
              icon={Megaphone}
              title="No Meta Ads data yet"
              body="Reconnect Meta from the clinic connections screen (the new permissions include ads access) and pick the ad account. Ads performance then syncs with the daily analytics job."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Last 30 days</Badge>
                {ads.ad_account_name && <Badge variant="secondary" className="text-[10px]">{ads.ad_account_name}</Badge>}
              </div>

              <StatGrid>
                <Stat index={0} label="Spend" value={money(ads.spend)} icon={DollarSign} accent="hsl(var(--chart-3))" />
                <Stat index={1} label="Reach" value={ads.reach} icon={Users} accent="hsl(var(--chart-1))" caption={`Freq. ${(ads.frequency || 0).toFixed(2)}`} />
                <Stat index={2} label="Impressions" value={ads.impressions} icon={Eye} />
                <Stat index={3} label="Clicks" value={ads.clicks} icon={MousePointerClick} accent="hsl(var(--chart-2))" caption={`${num(ads.link_clicks)} link clicks`} />
                <Stat index={4} label="CTR" value={`${(ads.ctr || 0).toFixed(2)}%`} icon={TrendingUp} accent="hsl(var(--chart-2))" />
                <Stat index={5} label="CPC" value={money(ads.cpc)} icon={DollarSign} />
                <Stat index={6} label="CPM" value={money(ads.cpm)} icon={DollarSign} />
                <Stat index={7} label="Results" value={ads.results || 0} icon={Target} accent="hsl(var(--chart-5))" caption={ads.results ? `${money(ads.cost_per_result)} per result` : "Leads & messages"} />
              </StatGrid>

              {ads.daily?.length > 0 && (
                <Panel title="Daily spend and clicks" subtitle="Paid delivery over the last 30 days" icon={DollarSign} accent="hsl(var(--chart-3))">
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={ads.daily}>
                      <defs>
                        <linearGradient id="grad-spend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" {...axis} minTickGap={24} />
                      <YAxis yAxisId="left" {...axis} />
                      <YAxis yAxisId="right" orientation="right" {...axis} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area yAxisId="left" type="monotone" name="Spend ($)" dataKey="spend" stroke="hsl(var(--chart-3))" strokeWidth={2} fill="url(#grad-spend)" />
                      <Line yAxisId="right" type="monotone" name="Clicks" dataKey="clicks" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Panel>
              )}

              {ads.campaigns?.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-3">
                  <Panel className="lg:col-span-2" title="Campaigns" subtitle="Performance by campaign" icon={Megaphone} accent="hsl(var(--chart-3))">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                            <th className="pb-2 text-left font-semibold">Campaign</th>
                            <th className="pb-2 text-right font-semibold">Spend</th>
                            <th className="pb-2 text-right font-semibold">Reach</th>
                            <th className="pb-2 text-right font-semibold">Impr.</th>
                            <th className="pb-2 text-right font-semibold">Clicks</th>
                            <th className="pb-2 text-right font-semibold">CTR</th>
                            <th className="pb-2 text-right font-semibold">CPC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ads.campaigns.map((c: any) => (
                            <tr key={c.name} className="border-t border-border/50 transition-colors hover:bg-muted/30">
                              <td className="max-w-[220px] truncate py-2 pr-3">{c.name}</td>
                              <td className="py-2 text-right tabular-nums">{money(c.spend)}</td>
                              <td className="py-2 text-right tabular-nums">{num(c.reach)}</td>
                              <td className="py-2 text-right tabular-nums">{num(c.impressions)}</td>
                              <td className="py-2 text-right tabular-nums">{num(c.clicks)}</td>
                              <td className="py-2 text-right tabular-nums">{(c.ctr || 0).toFixed(2)}%</td>
                              <td className="py-2 text-right tabular-nums">{money(c.cpc)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>

                  <Panel title="Budget split" subtitle="Spend share by campaign" icon={Target} accent="hsl(var(--chart-5))">
                    <Donut
                      data={[...ads.campaigns]
                        .sort((a: any, b: any) => (b.spend || 0) - (a.spend || 0))
                        .slice(0, 5)
                        .map((c: any) => ({ name: c.name, value: Math.round((c.spend || 0) * 100) / 100 }))}
                      unit="spend"
                    />
                  </Panel>
                </div>
              )}

              {ads.ads?.length > 0 && (
                <Panel title="Top ads" subtitle="Highest spend first" icon={Sparkles} accent="hsl(var(--chart-3))">
                  <div className="divide-y divide-border/50">
                    {[...ads.ads].sort((a: any, b: any) => (b.spend || 0) - (a.spend || 0)).slice(0, 10).map((a: any, i: number) => (
                      <div key={`${a.name}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-medium">{a.name}</p>
                          <p className="truncate text-[10.5px] text-muted-foreground">{a.campaign}</p>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] tabular-nums text-muted-foreground">
                          <span className="font-semibold text-foreground">{money(a.spend)}</span>
                          <span>{num(a.reach)} reach</span>
                          <span>{num(a.clicks)} clicks</span>
                          <span>{(a.ctr || 0).toFixed(2)}% CTR</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </TabsContent>

        {/* ── AUDIENCE ── */}
        <TabsContent value="audience" className="mt-4 space-y-4">
          {(fb?.demographics || ig?.demographics) ? (
            <>
              {fb?.demographics?.gender_age && Object.keys(fb.demographics.gender_age).length > 0 && (
                <Panel title="Facebook · gender and age" subtitle="Fans by segment" icon={Users} accent="hsl(var(--chart-1))">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={Object.entries(fb.demographics.gender_age).map(([k, v]) => ({ segment: k, fans: v as number }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="segment" {...axis} />
                      <YAxis {...axis} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="fans" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {[
                  { key: "fb-country", title: "Facebook · top countries", icon: Globe, data: fb?.demographics?.country, color: "hsl(var(--chart-1))" },
                  { key: "fb-city", title: "Facebook · top cities", icon: Globe, data: fb?.demographics?.city, color: "hsl(var(--chart-2))" },
                  { key: "ig-country", title: "Instagram · top countries", icon: Globe, data: ig?.demographics?.country, color: "hsl(var(--chart-4))" },
                  { key: "ig-age", title: "Instagram · age and gender", icon: Users, data: ig?.demographics?.gender_age, color: "hsl(var(--chart-5))" },
                ].filter((s) => s.data && Object.keys(s.data).length > 0).map((s) => {
                  const rows = Object.entries(s.data as Record<string, number>)
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .slice(0, 8);
                  const max = (rows[0]?.[1] as number) || 1;
                  return (
                    <Panel key={s.key} title={s.title} icon={s.icon} accent={s.color}>
                      <div className="space-y-3">
                        {rows.map(([k, v]) => <BarRow key={k} label={k} value={v as number} max={max} color={s.color} />)}
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyPanel
              icon={Globe}
              title="No audience data yet"
              body="Audience demographics appear after the next sync (requires the Page admin to be an App Tester in the Meta app)."
            />
          )}
        </TabsContent>
      </Tabs>

      {perms && (
        <Panel title="Sync status detail" subtitle="Per-permission health from the last sync" icon={Activity}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {Object.entries(perms).map(([k, v]: any) => (
              <div key={k} className="flex items-center gap-2 text-[11px]">
                <span className={cn("h-1.5 w-1.5 rounded-full", v === "ok" ? "bg-success" : v === "missing" ? "bg-warning" : "bg-muted-foreground/40")} />
                <span className="truncate text-muted-foreground">{k}</span>
                <span className="ml-auto font-medium">{v}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
