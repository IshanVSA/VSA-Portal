import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getResetPasswordUrl, withCanonicalRedirect } from "../_shared/password-reset-link.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  if (!email) {
    return new Response(JSON.stringify({ error: "?email= required" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const resetUrl = getResetPasswordUrl();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: resetUrl },
  });

  if (error || !data?.properties?.hashed_token) {
    return new Response(JSON.stringify({ error: error?.message ?? "no token" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const builtFromHash = new URL(resetUrl);
  builtFromHash.searchParams.set("token_hash", data.properties.hashed_token);
  builtFromHash.searchParams.set("type", "recovery");
  const finalSentToClient = withCanonicalRedirect(builtFromHash.toString(), resetUrl);

  return new Response(JSON.stringify({
    reset_password_url_base: resetUrl,
    raw_action_link: data.properties.action_link,
    hashed_token_prefix: data.properties.hashed_token.slice(0, 12) + "...",
    link_in_email_button: finalSentToClient,
    parsed: {
      pathname: new URL(finalSentToClient).pathname,
      params: Object.fromEntries(new URL(finalSentToClient).searchParams.entries()),
    },
  }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
