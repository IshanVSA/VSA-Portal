// Shared request authorization helpers for edge functions.
//
// Many functions run with verify_jwt = false (or are invoked internally by
// pg_cron / other functions), so they must re-establish the caller's identity
// themselves. These helpers centralize that logic.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

export type AppRole = "admin" | "concierge" | "client" | "sub_client";

export interface Caller {
  userId: string | null;
  role: AppRole | null;
  /** true when the request presented the service-role key or CRON_SECRET */
  isService: boolean;
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
}

/** Internal machine-to-machine call (pg_cron, other edge functions). */
export function isServiceCall(req: Request): boolean {
  const token = bearer(req);
  const cronHeader = (req.headers.get("x-cron-secret") || "").trim();
  if (token && token === SUPABASE_SERVICE_ROLE_KEY) return true;
  if (CRON_SECRET && (token === CRON_SECRET || cronHeader === CRON_SECRET)) return true;
  return false;
}

/** Resolve the caller's identity and app role, if any. */
export async function getCaller(req: Request): Promise<Caller> {
  if (isServiceCall(req)) return { userId: null, role: null, isService: true };

  const authHeader = req.headers.get("Authorization") || "";
  const token = bearer(req);
  if (!token) return { userId: null, role: null, isService: false };

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data?.user) return { userId: null, role: null, isService: false };

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return {
    userId: data.user.id,
    role: (roleRow?.role as AppRole) ?? null,
    isService: false,
  };
}

function deny(status: number, message: string, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Require any signed-in user (or an internal service call).
 * Returns a Response to short-circuit on failure, otherwise the caller.
 */
export async function requireUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ caller: Caller } | { response: Response }> {
  const caller = await getCaller(req);
  if (caller.isService || caller.userId) return { caller };
  return { response: deny(401, "Unauthorized", corsHeaders) };
}

/**
 * Require an admin or concierge (staff) caller, or an internal service call.
 */
export async function requireStaff(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ caller: Caller } | { response: Response }> {
  const caller = await getCaller(req);
  if (caller.isService) return { caller };
  if (!caller.userId) return { response: deny(401, "Unauthorized", corsHeaders) };
  if (caller.role !== "admin" && caller.role !== "concierge") {
    return { response: deny(403, "Staff access required", corsHeaders) };
  }
  return { caller };
}

/** Require admin only (or internal service call). */
export async function requireAdminCaller(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ caller: Caller } | { response: Response }> {
  const caller = await getCaller(req);
  if (caller.isService) return { caller };
  if (!caller.userId) return { response: deny(401, "Unauthorized", corsHeaders) };
  if (caller.role !== "admin") return { response: deny(403, "Admin access required", corsHeaders) };
  return { caller };
}

/**
 * True when the caller may act on the given clinic:
 * service call, admin, or a user whose accessible clinics include it.
 */
export async function callerCanAccessClinic(caller: Caller, clinicId: string): Promise<boolean> {
  if (caller.isService || caller.role === "admin") return true;
  if (!caller.userId || !clinicId) return false;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await admin.rpc("get_accessible_clinic_ids", { _user_id: caller.userId });
  const ids = Array.isArray(data) ? data.map((r: any) => (typeof r === "string" ? r : r?.get_accessible_clinic_ids)) : [];
  if (ids.includes(clinicId)) return true;
  const { data: conc } = await admin.rpc("get_concierge_clinic_ids", { _user_id: caller.userId });
  const cids = Array.isArray(conc) ? conc.map((r: any) => (typeof r === "string" ? r : r?.get_concierge_clinic_ids)) : [];
  return cids.includes(clinicId);
}
