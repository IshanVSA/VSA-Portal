// Shared security helpers for edge functions
// - Origin allow-list for OAuth callback redirects
// - HMAC-signed OAuth `state` parameter
// - Audit logging into public.security_audit_log

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed redirect origins after OAuth completes.
// Anything not in this list falls back to FRONTEND_URL (default production portal).
const STATIC_ALLOWED_ORIGINS = [
  "https://portal.vsavetmedia.com",
  "https://vet-dash-suite.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];

// Lovable preview subdomains follow this regex
const LOVABLE_PREVIEW_RE = /^https:\/\/[a-z0-9-]+\.lovable\.app$/i;
const LOVABLE_ID_PREVIEW_RE = /^https:\/\/id-preview--[a-z0-9-]+\.lovable\.app$/i;

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const normalized = `${u.protocol}//${u.host}`;
    if (STATIC_ALLOWED_ORIGINS.includes(normalized)) return true;
    if (LOVABLE_PREVIEW_RE.test(normalized)) return true;
    if (LOVABLE_ID_PREVIEW_RE.test(normalized)) return true;
    return false;
  } catch {
    return false;
  }
}

export function safeRedirectBase(
  candidate: string | null | undefined,
  fallback: string,
): string {
  if (isAllowedOrigin(candidate)) return candidate as string;
  return fallback;
}

// ── HMAC-signed state ──
// Uses SUPABASE_SERVICE_ROLE_KEY as the signing secret (server-only).
// Format: base64url(payload) + "." + base64url(hmac)

const enc = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

function getSigningSecret(): string {
  return (
    Deno.env.get("OAUTH_STATE_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    ""
  );
}

export async function signState(payload: Record<string, unknown>): Promise<string> {
  const withMeta = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(withMeta)));
  const sig = await hmac(getSigningSecret(), payloadB64);
  return `${payloadB64}.${toBase64Url(sig)}`;
}

export async function verifyState(
  state: string,
  maxAgeSeconds = 600,
): Promise<Record<string, any> | null> {
  if (!state || !state.includes(".")) return null;
  const [payloadB64, sigB64] = state.split(".");
  if (!payloadB64 || !sigB64) return null;

  const expected = await hmac(getSigningSecret(), payloadB64);
  const actual = fromBase64Url(sigB64);
  if (expected.length !== actual.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  if (diff !== 0) return null;

  try {
    const json = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (typeof json.iat !== "number") return null;
    const ageSec = Math.floor(Date.now() / 1000) - json.iat;
    if (ageSec > maxAgeSeconds || ageSec < -60) return null;
    return json;
  } catch {
    return null;
  }
}

// ── Legacy state support (plain base64 JSON) ──
// Returns parsed object on success, null otherwise. Used as a fallback while
// any in-flight legacy OAuth flows complete.
export function tryParseLegacyState(state: string): Record<string, any> | null {
  try {
    if (state.includes(".")) return null; // looks like signed state
    return JSON.parse(atob(state));
  } catch {
    return null;
  }
}

// ── Audit logging ──
export interface AuditEvent {
  action: string;
  actor_user_id?: string | null;
  clinic_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logSecurityEvent(req: Request, event: AuditEvent): Promise<void> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ip =
      event.ip ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("cf-connecting-ip") ??
      null;
    const ua = event.user_agent ?? req.headers.get("user-agent") ?? null;

    await supabase.from("security_audit_log").insert({
      action: event.action,
      actor_user_id: event.actor_user_id ?? null,
      clinic_id: event.clinic_id ?? null,
      ip,
      user_agent: ua,
      metadata: event.metadata ?? {},
    });
  } catch (e) {
    console.error("logSecurityEvent failed:", e);
  }
}
