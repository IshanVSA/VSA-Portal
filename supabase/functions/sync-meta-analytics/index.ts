import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

async function decryptToken(encryptedText: string): Promise<string> {
  if (!encryptedText || !encryptedText.startsWith("enc:")) return encryptedText;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["decrypt"]);
  const combined = Uint8Array.from(atob(encryptedText.slice(4)), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return decoder.decode(decrypted);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0";

type PermStatus = "ok" | "missing" | "skipped";
interface PermissionsStatus {
  fb_page_info: PermStatus;
  fb_page_insights: PermStatus;
  fb_daily_trends: PermStatus;
  fb_posts: PermStatus;
  fb_post_insights: PermStatus;
  fb_demographics: PermStatus;
  ig_profile: PermStatus;
  ig_insights: PermStatus;
  ig_media_insights: PermStatus;
  ig_demographics: PermStatus;
  ig_online_followers: PermStatus;
  ig_stories: PermStatus;
  meta_ads: PermStatus;
}

async function gget(url: string): Promise<{ data: any; error: any }> {
  try {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) return { data: null, error: j.error };
    return { data: j, error: null };
  } catch (e: any) {
    return { data: null, error: { message: e.message } };
  }
}

/**
 * Cache an Instagram/Facebook CDN image into the public `department-files`
 * bucket so the UI never depends on expiring signed CDN URLs. Returns a stable
 * public URL, or the original URL on failure.
 *
 * Path: ig-thumbnails/{clinic_id}/{media_id}.jpg
 * Re-fetches at most every 72h (TTL well under IG's typical signed-url window).
 */
async function cacheRemoteImage(
  supabase: any,
  remoteUrl: string | null | undefined,
  clinicId: string,
  mediaId: string,
): Promise<string | null> {
  if (!remoteUrl) return null;
  // Already a stable Supabase storage URL — nothing to do.
  if (remoteUrl.includes("/storage/v1/object/public/")) return remoteUrl;

  const path = `ig-thumbnails/${clinicId}/${mediaId}.jpg`;
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/department-files/${path}`;

  try {
    // Skip refresh if a recent cached copy exists (< 72h old).
    const folder = `ig-thumbnails/${clinicId}`;
    const { data: existing } = await supabase.storage
      .from("department-files")
      .list(folder, { search: `${mediaId}.jpg`, limit: 1 });
    const found = existing?.find((f: any) => f.name === `${mediaId}.jpg`);
    if (found?.updated_at) {
      const ageMs = Date.now() - new Date(found.updated_at).getTime();
      if (ageMs < 72 * 60 * 60 * 1000) return publicUrl;
    }

    // Fetch the bytes from the CDN with a Referer that the Meta CDN accepts.
    const imgRes = await fetch(remoteUrl, {
      headers: { Referer: "https://www.instagram.com/", "User-Agent": "Mozilla/5.0" },
    });
    if (!imgRes.ok) return remoteUrl;
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    if (bytes.byteLength === 0) return remoteUrl;

    const { error: upErr } = await supabase.storage
      .from("department-files")
      .upload(path, bytes, {
        contentType: imgRes.headers.get("content-type") || "image/jpeg",
        upsert: true,
        cacheControl: "604800",
      });
    if (upErr) {
      console.warn("cacheRemoteImage upload failed", mediaId, upErr.message);
      return remoteUrl;
    }
    return publicUrl;
  } catch (e: any) {
    console.warn("cacheRemoteImage error", mediaId, e?.message);
    return remoteUrl;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const cronSecretHeader = req.headers.get("x-cron-secret");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    const isCronCall = !!CRON_SECRET && cronSecretHeader === CRON_SECRET;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!isCronCall) {
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });

      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = claimsData.claims.sub as string;
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!roleData || !["admin", "concierge"].includes(roleData.role)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { clinic_id } = await req.json();
    if (!clinic_id) {
      return new Response(JSON.stringify({ error: "clinic_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: creds } = await supabase
      .from("clinic_api_credentials")
      .select("meta_page_access_token, meta_page_id, meta_instagram_business_id, meta_user_access_token, meta_ad_account_id, meta_ad_account_name")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    if (!creds?.meta_page_access_token || !creds?.meta_page_id) {
      return new Response(JSON.stringify({ error: "Meta credentials not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tok = await decryptToken(creds.meta_page_access_token);
    const pageId = creds.meta_page_id;
    const igId = creds.meta_instagram_business_id;
    const today = new Date().toISOString().slice(0, 10);
    const analyticsRows: any[] = [];

    const perms: PermissionsStatus = {
      fb_page_info: "skipped",
      fb_page_insights: "skipped",
      fb_daily_trends: "skipped",
      fb_posts: "skipped",
      fb_post_insights: "skipped",
      fb_demographics: "skipped",
      ig_profile: "skipped",
      ig_insights: "skipped",
      ig_media_insights: "skipped",
      ig_demographics: "skipped",
      ig_online_followers: "skipped",
      ig_stories: "skipped",
      meta_ads: "skipped",
    };

    // ============================================================
    // FACEBOOK
    // ============================================================
    let fbPage: any = {};
    {
      const { data, error } = await gget(
        `${GRAPH}/${pageId}?fields=fan_count,name,followers_count,new_like_count,talking_about_count&access_token=${tok}`
      );
      if (error) { perms.fb_page_info = "missing"; console.warn("fb_page_info", JSON.stringify(error)); }
      else { perms.fb_page_info = "ok"; fbPage = data; }
    }

    // 28-day insights.
    // NOTE: Meta removed page-level reach/impressions/engaged-users in Graph v21+.
    // Only the metrics below still resolve; anything reach-like is derived from posts.
    const metricsMap: Record<string, any> = {};
    {
      const fbMetrics = [
        "page_post_engagements",
        "page_views_total",
        "page_video_views",
        "page_video_views_unique",
        "page_video_view_time",
        "page_actions_post_reactions_total",
        "page_actions_post_reactions_like_total",
        "page_total_actions",
        "page_daily_follows_unique",
        "page_daily_unfollows_unique",
      ];
      const { data, error } = await gget(
        `${GRAPH}/${pageId}/insights?metric=${fbMetrics.join(",")}&period=days_28&access_token=${tok}`
      );
      if (error) {
        // Fall back to per-metric requests so one invalid metric doesn't kill the batch
        let ok = 0;
        for (const metric of fbMetrics) {
          const r = await gget(
            `${GRAPH}/${pageId}/insights?metric=${metric}&period=days_28&access_token=${tok}`
          );
          const m = r.data?.data?.[0];
          if (!r.error && m) {
            ok++;
            const latest = m.values?.[m.values.length - 1];
            if (latest) metricsMap[m.name] = latest.value;
          }
        }
        perms.fb_page_insights = ok > 0 ? "ok" : "missing";
        if (ok === 0) console.warn("fb_page_insights", JSON.stringify(error));
      } else {
        perms.fb_page_insights = "ok";
        for (const m of data.data || []) {
          const latest = m.values?.[m.values.length - 1];
          if (latest) metricsMap[m.name] = latest.value;
        }
      }
    }

    // Total follows (lifetime-style counter)
    let pageFollows = 0;
    {
      const { data } = await gget(
        `${GRAPH}/${pageId}/insights?metric=page_follows&period=day&access_token=${tok}`
      );
      const vals = data?.data?.[0]?.values;
      if (Array.isArray(vals) && vals.length) pageFollows = vals[vals.length - 1]?.value || 0;
    }

    // Daily trends (only metrics that still exist at page level)
    const dailyData: any[] = [];
    {
      const thirty = new Date();
      thirty.setDate(thirty.getDate() - 30);
      const since = thirty.toISOString().slice(0, 10);
      const dayMetrics = [
        "page_post_engagements",
        "page_views_total",
        "page_daily_follows_unique",
        "page_daily_unfollows_unique",
        "page_video_views",
      ];
      const { data, error } = await gget(
        `${GRAPH}/${pageId}/insights?metric=${dayMetrics.join(",")}&period=day&since=${since}&until=${today}&access_token=${tok}`
      );
      if (error) { perms.fb_daily_trends = "missing"; console.warn("fb_daily_trends", JSON.stringify(error)); }
      else {
        perms.fb_daily_trends = "ok";
        const byName: Record<string, any[]> = {};
        for (const m of data.data || []) byName[m.name] = m.values || [];
        const len = Math.max(...dayMetrics.map((n) => byName[n]?.length || 0), 0);
        for (let i = 0; i < len; i++) {
          const stamp =
            byName.page_post_engagements?.[i]?.end_time ||
            byName.page_views_total?.[i]?.end_time ||
            byName.page_daily_follows_unique?.[i]?.end_time;
          dailyData.push({
            date: stamp?.slice(0, 10),
            engagements: byName.page_post_engagements?.[i]?.value || 0,
            page_views: byName.page_views_total?.[i]?.value || 0,
            new_follows: byName.page_daily_follows_unique?.[i]?.value || 0,
            unfollows: byName.page_daily_unfollows_unique?.[i]?.value || 0,
            video_views: byName.page_video_views?.[i]?.value || 0,
          });
        }
      }
    }

    // Demographics: still try Meta (some Pages/versions expose them). If Meta no
    // longer returns them, keep whatever we stored previously instead of wiping it.
    let fbDemographics: any = { country: {}, city: {}, gender_age: {} };
    {
      const { data, error } = await gget(
        `${GRAPH}/${pageId}/insights?metric=page_fans_country,page_fans_city,page_fans_gender_age&period=lifetime&access_token=${tok}`
      );
      const byName: Record<string, any> = {};
      for (const m of data?.data || []) {
        const latest = m.values?.[m.values.length - 1];
        if (latest?.value) byName[m.name] = latest.value;
      }
      if (!error && Object.keys(byName).length > 0) {
        perms.fb_demographics = "ok";
        fbDemographics = {
          country: byName.page_fans_country || {},
          city: byName.page_fans_city || {},
          gender_age: byName.page_fans_gender_age || {},
        };
      } else {
        // Not available on this Page / API version — preserve prior values.
        perms.fb_demographics = "skipped";
        const { data: prev } = await supabase
          .from("analytics")
          .select("metrics_json")
          .eq("clinic_id", clinic_id)
          .eq("platform", "facebook")
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        const prior = (prev as any)?.metrics_json?.demographics;
        if (prior && (Object.keys(prior.country || {}).length || Object.keys(prior.gender_age || {}).length)) {
          fbDemographics = prior;
        }
        if (error) console.warn("fb_demographics", JSON.stringify(error));
      }
    }

    // Recent posts
    let recentPosts: any[] = [];
    {
      const { data, error } = await gget(
        `${GRAPH}/${pageId}/posts?fields=id,message,created_time,full_picture,permalink_url,shares,likes.summary(true),comments.summary(true)&limit=25&access_token=${tok}`
      );
      if (error) { perms.fb_posts = "missing"; console.warn("fb_posts", JSON.stringify(error)); }
      else {
        perms.fb_posts = "ok";
        recentPosts = await Promise.all((data.data || []).map(async (post: any) => ({
          id: post.id,
          message: (post.message || "").slice(0, 200),
          created_time: post.created_time,
          picture: await cacheRemoteImage(supabase, post.full_picture, clinic_id, `fb_${post.id}`),
          permalink: post.permalink_url || null,
          likes: post.likes?.summary?.total_count || 0,
          comments: post.comments?.summary?.total_count || 0,
          shares: post.shares?.count || 0,
        })));
      }
    }

    // Per-post insights (only the metrics Meta still serves)
    if (recentPosts.length > 0) {
      let okCount = 0;
      for (const post of recentPosts) {
        const { data, error } = await gget(
          `${GRAPH}/${post.id}/insights?metric=post_clicks,post_video_views,post_reactions_by_type_total,post_activity_by_action_type&access_token=${tok}`
        );
        if (!error && data?.data) {
          okCount++;
          for (const m of data.data) {
            post[m.name] = m.values?.[0]?.value ?? 0;
          }
        }
        post.interactions =
          (post.likes || 0) + (post.comments || 0) + (post.shares || 0) + (post.post_clicks || 0);
      }
      perms.fb_post_insights = okCount > 0 ? "ok" : "missing";
    }

    const fbPostTotals = recentPosts.reduce(
      (acc, p) => {
        acc.likes += p.likes || 0;
        acc.comments += p.comments || 0;
        acc.shares += p.shares || 0;
        acc.clicks += p.post_clicks || 0;
        return acc;
      },
      { likes: 0, comments: 0, shares: 0, clicks: 0 }
    );

    const fbReactions = metricsMap.page_actions_post_reactions_total || {};

    analyticsRows.push({
      clinic_id,
      platform: "facebook",
      metric_type: "monthly_summary",
      date: today,
      value: fbPage.fan_count || 0,
      metrics_json: {
        likes: fbPage.fan_count || 0,
        followers: fbPage.followers_count || pageFollows || 0,
        page_follows: pageFollows,
        // Page-level reach/impressions were removed by Meta in Graph v21+
        reach: 0,
        reach_unique: 0,
        reach_available: false,
        engagement: metricsMap.page_post_engagements || 0,
        post_engagements: metricsMap.page_post_engagements || 0,
        page_views: metricsMap.page_views_total || 0,
        total_actions: metricsMap.page_total_actions || 0,
        fan_adds: metricsMap.page_daily_follows_unique || 0,
        fan_removes: metricsMap.page_daily_unfollows_unique || 0,
        net_follower_change:
          (metricsMap.page_daily_follows_unique || 0) - (metricsMap.page_daily_unfollows_unique || 0),
        video_views: metricsMap.page_video_views || 0,
        video_views_unique: metricsMap.page_video_views_unique || 0,
        video_view_time_ms: metricsMap.page_video_view_time || 0,
        reactions: Array.isArray(fbReactions) ? (fbReactions[0] || {}) : fbReactions,
        post_totals: fbPostTotals,
        posts_analyzed: recentPosts.length,
        avg_interactions_per_post: recentPosts.length
          ? Math.round(
              ((fbPostTotals.likes + fbPostTotals.comments + fbPostTotals.shares + fbPostTotals.clicks) /
                recentPosts.length) * 10
            ) / 10
          : 0,
        talking_about: fbPage.talking_about_count || 0,
        daily_trends: dailyData,
        recent_posts: recentPosts,
        demographics: fbDemographics,
      },
    });


    // ============================================================
    // INSTAGRAM
    // ============================================================
    if (igId) {
      let followers = 0;
      let mediaCount = 0;
      let username = "";
      let profilePic = "";
      {
        const { data, error } = await gget(
          `${GRAPH}/${igId}?fields=followers_count,media_count,username,profile_picture_url&access_token=${tok}`
        );
        if (error) { perms.ig_profile = "missing"; console.warn("ig_profile", JSON.stringify(error)); }
        else {
          perms.ig_profile = "ok";
          followers = data.followers_count || 0;
          mediaCount = data.media_count || 0;
          username = data.username || "";
          profilePic = await cacheRemoteImage(supabase, data.profile_picture_url || "", clinic_id, `ig_profile_${igId}`) || "";
        }
      }

      // IG insights — 28-day totals, requested per metric so one bad combo
      // doesn't drop the whole batch.
      const igMetrics: Record<string, number> = {};
      const igDaily: any[] = [];
      {
        const until = Math.floor(Date.now() / 1000);
        const since = until - 27 * 86400;
        const metricList = [
          "reach",
          "profile_views",
          "website_clicks",
          "accounts_engaged",
          "total_interactions",
          "likes",
          "comments",
          "shares",
          "saves",
          "views",
        ];
        let ok = 0;
        for (const metric of metricList) {
          const { data, error } = await gget(
            `${GRAPH}/${igId}/insights?metric=${metric}&metric_type=total_value&period=day&since=${since}&until=${until}&access_token=${tok}`
          );
          const m = data?.data?.[0];
          if (!error && m) {
            ok++;
            igMetrics[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? 0;
          } else if (error) {
            console.warn(`ig_insights:${metric}`, JSON.stringify(error));
          }
        }
        perms.ig_insights = ok > 0 ? "ok" : "missing";

        // Daily reach / views series for trend charts
        const { data: dayData } = await gget(
          `${GRAPH}/${igId}/insights?metric=reach&period=day&since=${since}&until=${until}&access_token=${tok}`
        );
        const reachVals = dayData?.data?.[0]?.values || [];
        for (const v of reachVals) {
          igDaily.push({ date: v.end_time?.slice(0, 10), reach: v.value || 0 });
        }
      }


      // IG media (recent posts) with insights
      const igMedia: any[] = [];
      {
        const { data, error } = await gget(
          `${GRAPH}/${igId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=12&access_token=${tok}`
        );
        if (!error && data?.data) {
          for (const m of data.data) {
            const rawThumb = m.thumbnail_url || m.media_url;
            const cachedThumb = await cacheRemoteImage(supabase, rawThumb, clinic_id, `ig_${m.id}`);
            const item: any = {
              id: m.id,
              caption: (m.caption || "").slice(0, 200),
              media_type: m.media_type,
              media_url: m.media_url,
              thumbnail_url: cachedThumb,
              permalink: m.permalink,
              timestamp: m.timestamp,
              likes: m.like_count || 0,
              comments: m.comments_count || 0,
            };
            // Per-media insights
            const metricSet = m.media_type === "VIDEO" || m.media_type === "REELS"
              ? "reach,saved,likes,comments,shares,views"
              : "reach,saved,likes,comments,shares";
            const ins = await gget(`${GRAPH}/${m.id}/insights?metric=${metricSet}&access_token=${tok}`);
            if (!ins.error && ins.data?.data) {
              for (const im of ins.data.data) {
                item[im.name] = im.values?.[0]?.value ?? 0;
              }
            }
            igMedia.push(item);
          }
          perms.ig_media_insights = igMedia.some(i => i.reach !== undefined) ? "ok" : "missing";
        } else {
          perms.ig_media_insights = "missing";
          if (error) console.warn("ig_media_insights", JSON.stringify(error));
        }
      }

      // Demographics
      const igDemographics: any = { country: {}, city: {}, gender_age: {} };
      {
        const breakdowns = ["country", "city", "age,gender"];
        let ok = 0;
        for (const bd of breakdowns) {
          const { data, error } = await gget(
            `${GRAPH}/${igId}/insights?metric=follower_demographics&period=lifetime&breakdown=${encodeURIComponent(bd)}&metric_type=total_value&access_token=${tok}`
          );
          if (!error && data?.data?.[0]) {
            ok++;
            const breakdown = data.data[0].total_value?.breakdowns?.[0];
            const results = breakdown?.results || [];
            const map: Record<string, number> = {};
            for (const r of results) {
              const key = r.dimension_values?.join(" · ") || "unknown";
              map[key] = r.value;
            }
            if (bd === "country") igDemographics.country = map;
            else if (bd === "city") igDemographics.city = map;
            else igDemographics.gender_age = map;
          }
        }
        perms.ig_demographics = ok > 0 ? "ok" : "missing";
      }

      // Online followers (best times to post)
      const onlineFollowers: Record<string, number> = {};
      {
        const { data, error } = await gget(
          `${GRAPH}/${igId}/insights?metric=online_followers&period=lifetime&access_token=${tok}`
        );
        if (error) { perms.ig_online_followers = "missing"; console.warn("ig_online_followers", JSON.stringify(error)); }
        else {
          perms.ig_online_followers = "ok";
          const v = data.data?.[0]?.values?.[data.data[0].values.length - 1]?.value || {};
          Object.assign(onlineFollowers, v);
        }
      }

      // Stories (last 24h)
      const stories: any[] = [];
      {
        const { data, error } = await gget(
          `${GRAPH}/${igId}/stories?fields=id,media_type,media_url,thumbnail_url,permalink,timestamp&access_token=${tok}`
        );
        if (!error && data?.data) {
          for (const s of data.data) {
            const rawStoryThumb = s.thumbnail_url || s.media_url;
            const cachedStoryThumb = await cacheRemoteImage(supabase, rawStoryThumb, clinic_id, `igs_${s.id}`);
            const item: any = {
              id: s.id,
              media_type: s.media_type,
              thumbnail_url: cachedStoryThumb,
              permalink: s.permalink,
              timestamp: s.timestamp,
            };
            const ins = await gget(`${GRAPH}/${s.id}/insights?metric=reach,replies,views&access_token=${tok}`);
            if (!ins.error && ins.data?.data) {
              for (const im of ins.data.data) item[im.name] = im.values?.[0]?.value ?? 0;
            }
            stories.push(item);
          }
          perms.ig_stories = "ok";
        } else {
          perms.ig_stories = "missing";
        }
      }

      const engagementRate = followers > 0 && igMedia.length > 0
        ? Math.round(
            (igMedia.reduce((s, m) => s + (m.likes || 0) + (m.comments || 0), 0) / igMedia.length / followers) * 10000
          ) / 100
        : 0;

      analyticsRows.push({
        clinic_id,
        platform: "instagram",
        metric_type: "monthly_summary",
        date: today,
        value: followers,
        metrics_json: {
          username,
          profile_picture: profilePic,
          followers,
          media_count: mediaCount,
          reach: igMetrics.reach || 0,
          profile_views: igMetrics.profile_views || 0,
          website_clicks: igMetrics.website_clicks || 0,
          accounts_engaged: igMetrics.accounts_engaged || 0,
          total_interactions: igMetrics.total_interactions || 0,
          likes: igMetrics.likes || 0,
          comments: igMetrics.comments || 0,
          shares: igMetrics.shares || 0,
          saves: igMetrics.saves || 0,
          views: igMetrics.views || 0,
          engagement_rate: engagementRate,
          daily_trends: igDaily,
          recent_media: igMedia,
          demographics: igDemographics,
          online_followers: onlineFollowers,
          stories,
        },
      });
    }

    // ============================================================
    // META ADS
    // ============================================================
    if (creds.meta_user_access_token && creds.meta_ad_account_id) {
      try {
        const userTok = await decryptToken(creds.meta_user_access_token);
        const act = creds.meta_ad_account_id.startsWith("act_")
          ? creds.meta_ad_account_id
          : `act_${creds.meta_ad_account_id}`;
        const baseFields =
          "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type,inline_link_clicks";

        const summaryRes = await gget(
          `${GRAPH}/${act}/insights?fields=${baseFields}&date_preset=last_30d&access_token=${userTok}`
        );
        if (summaryRes.error) {
          perms.meta_ads = "missing";
          console.warn("meta_ads_summary", JSON.stringify(summaryRes.error));
        } else {
          perms.meta_ads = "ok";
          const s = summaryRes.data?.data?.[0] || {};

          const dailyRes = await gget(
            `${GRAPH}/${act}/insights?fields=spend,impressions,reach,clicks,ctr,cpc&date_preset=last_30d&time_increment=1&limit=100&access_token=${userTok}`
          );
          const daily = (dailyRes.data?.data || []).map((d: any) => ({
            date: d.date_start,
            spend: Number(d.spend || 0),
            impressions: Number(d.impressions || 0),
            reach: Number(d.reach || 0),
            clicks: Number(d.clicks || 0),
            ctr: Number(d.ctr || 0),
            cpc: Number(d.cpc || 0),
          }));

          const campRes = await gget(
            `${GRAPH}/${act}/insights?fields=campaign_name,${baseFields}&level=campaign&date_preset=last_30d&limit=50&access_token=${userTok}`
          );
          const campaigns = (campRes.data?.data || []).map((c: any) => ({
            name: c.campaign_name,
            spend: Number(c.spend || 0),
            impressions: Number(c.impressions || 0),
            reach: Number(c.reach || 0),
            clicks: Number(c.clicks || 0),
            ctr: Number(c.ctr || 0),
            cpc: Number(c.cpc || 0),
            actions: c.actions || [],
          }));

          const adRes = await gget(
            `${GRAPH}/${act}/insights?fields=ad_name,campaign_name,${baseFields}&level=ad&date_preset=last_30d&limit=25&access_token=${userTok}`
          );
          const ads = (adRes.data?.data || []).map((a: any) => ({
            name: a.ad_name,
            campaign: a.campaign_name,
            spend: Number(a.spend || 0),
            impressions: Number(a.impressions || 0),
            reach: Number(a.reach || 0),
            clicks: Number(a.clicks || 0),
            ctr: Number(a.ctr || 0),
            cpc: Number(a.cpc || 0),
          }));

          const actionsList = Array.isArray(s.actions) ? s.actions : [];
          const actionValue = (t: string) =>
            Number(actionsList.find((a: any) => a.action_type === t)?.value || 0);
          const results =
            actionValue("lead") +
            actionValue("onsite_conversion.messaging_conversation_started_7d") +
            actionValue("offsite_conversion.fb_pixel_lead");

          analyticsRows.push({
            clinic_id,
            platform: "meta_ads",
            metric_type: "monthly_summary",
            date: today,
            value: Number(s.spend || 0),
            metrics_json: {
              ad_account_id: act,
              ad_account_name: creds.meta_ad_account_name || null,
              window: "last_30d",
              spend: Number(s.spend || 0),
              impressions: Number(s.impressions || 0),
              reach: Number(s.reach || 0),
              clicks: Number(s.clicks || 0),
              link_clicks: Number(s.inline_link_clicks || 0),
              ctr: Number(s.ctr || 0),
              cpc: Number(s.cpc || 0),
              cpm: Number(s.cpm || 0),
              frequency: Number(s.frequency || 0),
              page_engagements: actionValue("page_engagement"),
              post_engagements: actionValue("post_engagement"),
              leads: actionValue("lead"),
              messaging_started: actionValue("onsite_conversion.messaging_conversation_started_7d"),
              results,
              cost_per_result: results > 0 ? Number(s.spend || 0) / results : 0,
              actions: actionsList,
              cost_per_action_type: s.cost_per_action_type || [],
              daily,
              campaigns,
              ads,
            },
          });

          await supabase
            .from("clinic_api_credentials")
            .update({ last_meta_ads_sync_at: new Date().toISOString() })
            .eq("clinic_id", clinic_id);
        }
      } catch (adErr: any) {
        perms.meta_ads = "missing";
        console.error("meta ads sync error:", adErr?.message || adErr);
      }
    }

    if (analyticsRows.length > 0) {
      const { error: insertError } = await supabase.from("analytics").insert(analyticsRows);
      if (insertError) console.error("Analytics insert error:", insertError);
    }

    await supabase
      .from("clinic_api_credentials")
      .update({ last_meta_sync_at: new Date().toISOString() })
      .eq("clinic_id", clinic_id);

    return new Response(
      JSON.stringify({
        success: true,
        synced: analyticsRows.map((r) => r.platform),
        permissions_status: perms,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-meta-analytics error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
