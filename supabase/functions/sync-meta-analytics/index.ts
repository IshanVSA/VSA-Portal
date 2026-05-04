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
      .select("meta_page_access_token, meta_page_id, meta_instagram_business_id")
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

    // 28-day insights
    const metricsMap: Record<string, any> = {};
    {
      const fbMetrics = [
        "page_impressions",
        "page_impressions_unique",
        "page_engaged_users",
        "page_post_engagements",
        "page_views_total",
        "page_fan_adds",
        "page_fan_removes",
        "page_actions_post_reactions_total",
        "page_video_views",
      ].join(",");
      const { data, error } = await gget(
        `${GRAPH}/${pageId}/insights?metric=${fbMetrics}&period=days_28&access_token=${tok}`
      );
      if (error) { perms.fb_page_insights = "missing"; console.warn("fb_page_insights", JSON.stringify(error)); }
      else {
        perms.fb_page_insights = "ok";
        for (const m of data.data || []) {
          const latest = m.values?.[m.values.length - 1];
          if (latest) metricsMap[m.name] = latest.value;
        }
      }
    }

    // Daily trends
    const dailyData: any[] = [];
    {
      const thirty = new Date();
      thirty.setDate(thirty.getDate() - 30);
      const since = thirty.toISOString().slice(0, 10);
      const { data, error } = await gget(
        `${GRAPH}/${pageId}/insights?metric=page_impressions,page_engaged_users,page_views_total&period=day&since=${since}&until=${today}&access_token=${tok}`
      );
      if (error) { perms.fb_daily_trends = "missing"; console.warn("fb_daily_trends", JSON.stringify(error)); }
      else {
        perms.fb_daily_trends = "ok";
        const imp = data.data?.find((m: any) => m.name === "page_impressions");
        const eng = data.data?.find((m: any) => m.name === "page_engaged_users");
        const vws = data.data?.find((m: any) => m.name === "page_views_total");
        const len = imp?.values?.length || 0;
        for (let i = 0; i < len; i++) {
          dailyData.push({
            date: imp?.values[i]?.end_time?.slice(0, 10),
            impressions: imp?.values[i]?.value || 0,
            engaged_users: eng?.values?.[i]?.value || 0,
            page_views: vws?.values?.[i]?.value || 0,
          });
        }
      }
    }

    // Demographics
    const fbDemographics: any = { country: {}, city: {}, gender_age: {} };
    {
      const { data, error } = await gget(
        `${GRAPH}/${pageId}/insights?metric=page_fans_country,page_fans_city,page_fans_gender_age&period=lifetime&access_token=${tok}`
      );
      if (error) { perms.fb_demographics = "missing"; console.warn("fb_demographics", JSON.stringify(error)); }
      else {
        perms.fb_demographics = "ok";
        for (const m of data.data || []) {
          const v = m.values?.[m.values.length - 1]?.value || {};
          if (m.name === "page_fans_country") fbDemographics.country = v;
          else if (m.name === "page_fans_city") fbDemographics.city = v;
          else if (m.name === "page_fans_gender_age") fbDemographics.gender_age = v;
        }
      }
    }

    // Recent posts
    let recentPosts: any[] = [];
    {
      const { data, error } = await gget(
        `${GRAPH}/${pageId}/posts?fields=id,message,created_time,full_picture,permalink_url,shares,likes.summary(true),comments.summary(true)&limit=10&access_token=${tok}`
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

    // Per-post insights
    if (recentPosts.length > 0) {
      let okCount = 0;
      for (const post of recentPosts) {
        const { data, error } = await gget(
          `${GRAPH}/${post.id}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_clicks&access_token=${tok}`
        );
        if (!error && data?.data) {
          okCount++;
          for (const m of data.data) {
            const v = m.values?.[0]?.value || 0;
            post[m.name] = v;
          }
        }
      }
      perms.fb_post_insights = okCount > 0 ? "ok" : "missing";
    }

    analyticsRows.push({
      clinic_id,
      platform: "facebook",
      metric_type: "monthly_summary",
      date: today,
      value: fbPage.fan_count || 0,
      metrics_json: {
        likes: fbPage.fan_count || 0,
        followers: fbPage.followers_count || 0,
        reach: metricsMap.page_impressions || 0,
        reach_unique: metricsMap.page_impressions_unique || 0,
        engagement: metricsMap.page_engaged_users || 0,
        post_engagements: metricsMap.page_post_engagements || 0,
        page_views: metricsMap.page_views_total || 0,
        fan_adds: metricsMap.page_fan_adds || 0,
        fan_removes: metricsMap.page_fan_removes || 0,
        video_views: metricsMap.page_video_views || 0,
        reactions: metricsMap.page_actions_post_reactions_total || {},
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
          profilePic = data.profile_picture_url || "";
        }
      }

      // IG insights — use the modern, supported metrics
      const igMetrics: Record<string, number> = {};
      {
        const metricList = "reach,profile_views,website_clicks,accounts_engaged,total_interactions,likes,comments,shares,saves,views";
        const { data, error } = await gget(
          `${GRAPH}/${igId}/insights?metric=${metricList}&metric_type=total_value&period=day&access_token=${tok}`
        );
        if (error) { perms.ig_insights = "missing"; console.warn("ig_insights", JSON.stringify(error)); }
        else {
          perms.ig_insights = "ok";
          for (const m of data.data || []) {
            igMetrics[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? 0;
          }
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
            const item: any = {
              id: s.id,
              media_type: s.media_type,
              thumbnail_url: s.thumbnail_url || s.media_url,
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
          recent_media: igMedia,
          demographics: igDemographics,
          online_followers: onlineFollowers,
          stories,
        },
      });
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
