import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertExists,
  assertNotMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

import { getResetPasswordUrl, resolvePublicSiteUrl, withCanonicalRedirect } from "../_shared/password-reset-link.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.test("resolvePublicSiteUrl ignores localhost values", () => {
  assertEquals(resolvePublicSiteUrl("http://localhost:3000"), "https://vet-dash-suite.lovable.app");
  assertEquals(resolvePublicSiteUrl("http://127.0.0.1:5173"), "https://vet-dash-suite.lovable.app");
  assertEquals(resolvePublicSiteUrl("https://vet-dash-suite.lovable.app/"), "https://vet-dash-suite.lovable.app");
});

Deno.test("recovery links always redirect to the live reset-password route", async () => {
  assert(SUPABASE_URL, "SUPABASE_URL or VITE_SUPABASE_URL is required for this test");
  assert(SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY is required for this test");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const email = `reset-link-test+${crypto.randomUUID()}@example.com`;
  const password = `Temp-${crypto.randomUUID()}Aa1!`;

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  assert(!createError, createError?.message ?? "Failed to create test user");
  assertExists(createdUser.user?.id, "Expected a test user id");

  try {
    const expectedResetUrl = getResetPasswordUrl();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: expectedResetUrl,
      },
    });

    assert(!linkError, linkError?.message ?? "Failed to generate recovery link");
    assertExists(linkData.properties?.action_link, "Expected an action_link in the recovery response");

    const finalActionLink = withCanonicalRedirect(linkData.properties.action_link, expectedResetUrl);
    const url = new URL(finalActionLink);

    assertEquals(url.searchParams.get("redirect_to"), expectedResetUrl);
    assertNotMatch(finalActionLink, /localhost|127\.0\.0\.1|0\.0\.0\.0/i);
  } finally {
    await admin.auth.admin.deleteUser(createdUser.user.id);
  }
});