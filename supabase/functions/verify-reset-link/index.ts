import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

import { getResetPasswordUrl, withCanonicalRedirect } from "../_shared/password-reset-link.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Supabase admin credentials are not configured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (roleError) {
      return json({ error: roleError.message }, 500);
    }

    if (roleData?.role !== "admin") {
      return json({ error: "Forbidden: admin only" }, 403);
    }

    const testEmail = `reset-link-check+${crypto.randomUUID()}@example.com`;
    const testPassword = `Temp-${crypto.randomUUID()}Aa1!`;
    const expectedResetUrl = getResetPasswordUrl();

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (createError || !createdUser.user?.id) {
      return json({ error: createError?.message ?? "Failed to create verification user" }, 500);
    }

    try {
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: testEmail,
        options: {
          redirectTo: expectedResetUrl,
        },
      });

      if (linkError || !linkData.properties?.hashed_token) {
        return json({ error: linkError?.message ?? "Failed to generate recovery link" }, 500);
      }

      const resetUrl = new URL(expectedResetUrl);
      resetUrl.searchParams.set("token_hash", linkData.properties.hashed_token);
      resetUrl.searchParams.set("type", "recovery");
      const finalActionLink = withCanonicalRedirect(resetUrl.toString(), expectedResetUrl);
      const parsed = new URL(finalActionLink);
      const redirectTo = parsed.searchParams.get("redirect_to");
      const tokenHash = parsed.searchParams.get("token_hash");
      const type = parsed.searchParams.get("type");
      const pointsToLocalhost = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(finalActionLink);

      return json({
        ok: redirectTo === expectedResetUrl && type === "recovery" && Boolean(tokenHash) && !pointsToLocalhost,
        expectedResetUrl,
        redirectTo,
        tokenHashPresent: Boolean(tokenHash),
        type,
        pointsToLocalhost,
        finalActionLink,
      });
    } finally {
      await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});