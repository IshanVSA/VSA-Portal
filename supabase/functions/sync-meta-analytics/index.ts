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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
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

    // Check role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

    const { clinic_id } = await req.json();
    if (!clinic_id) {
      return new Response(JSON.stringify({ error: "clinic_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get credentials
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

    const token_str = await decryptToken(creds.meta_page_access_token);
    const pageId = creds.meta_page_id;
    const igId = creds.meta_instagram_business_id;
    const today = new Date().toISOString().slice(0, 10);
    const analyticsRows: any[] = [];

    // ---- Facebook Page Insights ----
    try {
      // Basic page info (works with pages_read_engagement)
      const fbRes = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}?fields=fan_count,name,followers_count,new_like_count,talking_about_count&access_token=${token_str}`
      );
      const fbPage = await fbRes.json();
      if (fbPage.error) {
        console.error("Facebook page info error:", JSON.stringify(fbPage.error));
      }

      // Attempt page insights (requires read_insights - may fail without App Review)
      const metricsMap: Record<string, any> = {};
      const dailyData: any[] = [];
      let recentPosts: any[] = [];
      let reactions: any = {};

      try {
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

        const insightsRes = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}/insights?metric=${fbMetrics}&period=days_28&access_token=${token_str}`
        );
        const insightsData = await insightsRes.json();
        if (insightsData.error) {
          console.warn("Facebook insights unavailable (may need App Review):", JSON.stringify(insightsData.error));
        } else if (insightsData.data) {
          for (const metric of insightsData.data) {
            const latest = metric.values?.[metric.values.length - 1];
            if (latest) metricsMap[metric.name] = latest.value;
          }
        }
      } catch (insightsErr) {
        console.warn("Insights fetch failed (non-fatal):", insightsErr);
      }

      // Attempt daily trends (requires read_insights)
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const sinceStr = thirtyDaysAgo.toISOString().slice(0, 10);
        const untilStr = today;

        const dailyInsightsRes = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}/insights?metric=page_impressions,page_engaged_users,page_views_total&period=day&since=${sinceStr}&until=${untilStr}&access_token=${token_str}`
        );
        const dailyInsights = await dailyInsightsRes.json();
        if (dailyInsights.error) {
          console.warn("Daily insights unavailable (may need App Review):", JSON.stringify(dailyInsights.error));
        } else if (dailyInsights.data && dailyInsights.data.length > 0) {
          const impressionsMetric = dailyInsights.data.find((m: any) => m.name === "page_impressions");
          const engagedMetric = dailyInsights.data.find((m: any) => m.name === "page_engaged_users");
          const viewsMetric = dailyInsights.data.find((m: any) => m.name === "page_views_total");
          const len = impressionsMetric?.values?.length || 0;
          for (let i = 0; i < len; i++) {
            dailyData.push({
              date: impressionsMetric?.values[i]?.end_time?.slice(0, 10),
              impressions: impressionsMetric?.values[i]?.value || 0,
              engaged_users: engagedMetric?.values?.[i]?.value || 0,
              page_views: viewsMetric?.values?.[i]?.value || 0,
            });
          }
        }
      } catch (dailyErr) {
        console.warn("Daily trends fetch failed (non-fatal):", dailyErr);
      }

      // Attempt recent posts (may require pages_read_user_content for full data)
      try {
        const postsRes = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}/posts?fields=id,message,created_time,shares,likes.summary(true),comments.summary(true)&limit=10&access_token=${token_str}`
        );
        const postsData = await postsRes.json();
        if (postsData.error) {
          console.warn("Posts fetch unavailable:", JSON.stringify(postsData.error));
        } else {
          recentPosts = (postsData.data || []).map((post: any) => ({
            id: post.id,
            message: (post.message || "").slice(0, 120),
            created_time: post.created_time,
            likes: post.likes?.summary?.total_count || 0,
            comments: post.comments?.summary?.total_count || 0,
            shares: post.shares?.count || 0,
          }));
        }
      } catch (postsErr) {
        console.warn("Posts fetch failed (non-fatal):", postsErr);
      }

      reactions = metricsMap.page_actions_post_reactions_total || {};

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
          reactions,
          talking_about: fbPage.talking_about_count || 0,
          daily_trends: dailyData,
          recent_posts: recentPosts,
        },
      });
    } catch (e) {
      console.error("Facebook fetch error:", e);
    }

    // ---- Instagram Insights ----
    if (igId) {
      try {
        let followers = 0;
        let mediaCount = 0;
        const igMetrics: Record<string, number> = {};
        let engagementRate = 0;

        // Get follower count (basic profile info)
        try {
          const igProfileRes = await fetch(
            `https://graph.facebook.com/v21.0/${igId}?fields=followers_count,media_count&access_token=${token_str}`
          );
          const igProfile = await igProfileRes.json();
          if (igProfile.error) {
            console.warn("Instagram profile info error:", JSON.stringify(igProfile.error));
          } else {
            followers = igProfile.followers_count || 0;
            mediaCount = igProfile.media_count || 0;
          }
        } catch (profileErr) {
          console.warn("Instagram profile fetch failed (non-fatal):", profileErr);
        }

        // Get insights - reach, impressions (may require additional permissions)
        try {
          const igInsightsRes = await fetch(
            `https://graph.facebook.com/v21.0/${igId}/insights?metric=reach,impressions&period=days_28&access_token=${token_str}`
          );
          const igInsights = await igInsightsRes.json();
          if (igInsights.error) {
            console.warn("Instagram insights unavailable (may need App Review):", JSON.stringify(igInsights.error));
          } else if (igInsights.data) {
            for (const metric of igInsights.data) {
              const latest = metric.values?.[metric.values.length - 1];
              if (latest) igMetrics[metric.name] = latest.value;
            }
          }
        } catch (insightsErr) {
          console.warn("Instagram insights fetch failed (non-fatal):", insightsErr);
        }

        // Calculate engagement from recent media
        try {
          if (followers > 0) {
            const mediaRes = await fetch(
              `https://graph.facebook.com/v21.0/${igId}/media?fields=like_count,comments_count&limit=25&access_token=${token_str}`
            );
            const mediaData = await mediaRes.json();
            if (mediaData.error) {
              console.warn("Instagram media fetch error:", JSON.stringify(mediaData.error));
            } else if (mediaData.data && mediaData.data.length > 0) {
              const totalEngagement = mediaData.data.reduce(
                (sum: number, m: any) => sum + (m.like_count || 0) + (m.comments_count || 0),
                0
              );
              engagementRate = Math.round((totalEngagement / mediaData.data.length / followers) * 10000) / 100;
            }
          }
        } catch (mediaErr) {
          console.warn("Instagram media fetch failed (non-fatal):", mediaErr);
        }

        analyticsRows.push({
          clinic_id,
          platform: "instagram",
          metric_type: "monthly_summary",
          date: today,
          value: followers,
          metrics_json: {
            followers,
            media_count: mediaCount,
            reach: igMetrics.reach || 0,
            impressions: igMetrics.impressions || 0,
            engagement: engagementRate,
          },
        });
      } catch (e) {
        console.error("Instagram fetch error:", e);
      }
    }

    // Insert analytics rows
    if (analyticsRows.length > 0) {
      const { error: insertError } = await supabase.from("analytics").insert(analyticsRows);
      if (insertError) console.error("Analytics insert error:", insertError);
    }

    // Update last sync timestamp
    await supabase
      .from("clinic_api_credentials")
      .update({ last_meta_sync_at: new Date().toISOString() })
      .eq("clinic_id", clinic_id);

    return new Response(
      JSON.stringify({
        success: true,
        synced: analyticsRows.map((r) => r.platform),
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
