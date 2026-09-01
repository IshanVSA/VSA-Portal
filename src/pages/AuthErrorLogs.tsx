import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ShieldAlert, ChevronDown, CheckCircle2, XCircle } from "lucide-react";
import { motion } from "framer-motion";

interface AuthErrorRow {
  id: string;
  created_at: string;
  context: string;
  email: string | null;
  user_id: string | null;
  success: boolean | null;
  failure_kind: string | null;
  error_code: string | null;
  error_status: number | null;
  error_message: string | null;
  friendly_message: string | null;
  user_agent: string | null;
  route: string | null;
}

interface IdentityInfo {
  kind: "admin" | "team" | "client" | "sub_client" | "unknown";
  name: string | null;
  clinics: string[];
}

const KIND_LABEL: Record<IdentityInfo["kind"], string> = {
  admin: "Admin",
  team: "Team member",
  client: "Client",
  sub_client: "Client sub-account",
  unknown: "Unknown account",
};

const KIND_BADGE_CLASS: Record<IdentityInfo["kind"], string> = {
  admin: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  team: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  client: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  sub_client: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

const CONTEXT_LABEL: Record<string, string> = {
  login: "Sign in",
  password_reset: "Password reset",
  session_recovery: "Session recovery",
};

const REASON_LABEL: Record<string, string> = {
  wrong_credentials: "Wrong email or password",
  email_not_confirmed: "Email not confirmed",
  rate_limited: "Rate limited (too many attempts)",
  network: "Network / timeout issue",
  server: "Server issue",
  session_expired: "Expired or invalid session",
  unknown: "Unknown reason",
};

type Filter = "all" | "failed" | "success";

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function AuthErrorLogs() {
  const [rows, setRows] = useState<AuthErrorRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [identities, setIdentities] = useState<Record<string, IdentityInfo>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const { data } = await supabase
      .from("auth_error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    const rows = (data as unknown as AuthErrorRow[]) ?? [];
    setRows(rows);
    loadIdentities(rows);
    setRefreshing(false);
  }, []);

  const loadIdentities = useCallback(async (rows: AuthErrorRow[]) => {
    // Older rows have no user_id — resolve those accounts by email instead.
    const emails = [
      ...new Set(
        rows
          .filter((r) => !r.user_id && r.email)
          .map((r) => (r.email as string).trim().toLowerCase()),
      ),
    ];
    const emailToUser = new Map<string, string>();
    if (emails.length > 0) {
      const { data: byEmail } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("email", emails);
      (byEmail ?? []).forEach((p) => {
        if (p.email && p.user_id) emailToUser.set(p.email.trim().toLowerCase(), p.user_id);
      });
    }
    const userIds = [
      ...new Set([
        ...(rows.map((r) => r.user_id).filter(Boolean) as string[]),
        ...emailToUser.values(),
      ]),
    ];
    if (userIds.length === 0) {
      setIdentities({});
      return;
    }
    const [rolesRes, profilesRes, clinicsRes, subsRes, subClinicsRes] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
      supabase.from("profiles").select("user_id, full_name").in("user_id", userIds),
      supabase.from("clinics").select("clinic_name, owner_user_id").in("owner_user_id", userIds),
      supabase.from("client_sub_accounts").select("parent_user_id, sub_user_id").in("sub_user_id", userIds),
      supabase.from("sub_account_clinics").select("sub_account_id, clinic_id").in("sub_account_id", userIds),
    ]);
    const clinicNames = new Map<string, string>();
    const clinicIdsNeeded = (subClinicsRes.data ?? []).map((s) => s.clinic_id);
    if (clinicIdsNeeded.length > 0) {
      const { data: cs } = await supabase.from("clinics").select("id, clinic_name").in("id", clinicIdsNeeded);
      (cs ?? []).forEach((c) => clinicNames.set(c.id, c.clinic_name));
    }
    // Clinics owned by parent clients, for showing a sub-account's parent clinics.
    const parentIds = [...new Set((subsRes.data ?? []).map((s) => s.parent_user_id))];
    const parentClinics = new Map<string, string[]>();
    if (parentIds.length > 0) {
      const { data: pcs } = await supabase.from("clinics").select("clinic_name, owner_user_id").in("owner_user_id", parentIds);
      (pcs ?? []).forEach((c) => {
        const list = parentClinics.get(c.owner_user_id) ?? [];
        list.push(c.clinic_name);
        parentClinics.set(c.owner_user_id, list);
      });
    }
    const roleByUser = new Map((rolesRes.data ?? []).map((r) => [r.user_id, r.role]));
    const nameByUser = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p.full_name]));
    const ownedClinics = new Map<string, string[]>();
    (clinicsRes.data ?? []).forEach((c) => {
      const list = ownedClinics.get(c.owner_user_id) ?? [];
      list.push(c.clinic_name);
      ownedClinics.set(c.owner_user_id, list);
    });
    const parentBySub = new Map((subsRes.data ?? []).map((s) => [s.sub_user_id, s.parent_user_id]));
    const subClinicIdsBySub = new Map<string, string[]>();
    (subClinicsRes.data ?? []).forEach((s) => {
      const list = subClinicIdsBySub.get(s.sub_account_id) ?? [];
      list.push(s.clinic_id);
      subClinicIdsBySub.set(s.sub_account_id, list);
    });

    const map: Record<string, IdentityInfo> = {};
    for (const uid of userIds) {
      const role = roleByUser.get(uid);
      const name = nameByUser.get(uid) ?? null;
      let kind: IdentityInfo["kind"] = "unknown";
      let clinics: string[] = [];
      if (role === "admin") kind = "admin";
      else if (role === "concierge") kind = "team";
      else if (role === "client") {
        kind = "client";
        clinics = ownedClinics.get(uid) ?? [];
      } else if (role === "sub_client") {
        kind = "sub_client";
        const explicit = (subClinicIdsBySub.get(uid) ?? [])
          .map((id) => clinicNames.get(id))
          .filter(Boolean) as string[];
        clinics = explicit.length > 0 ? explicit : (parentClinics.get(parentBySub.get(uid) ?? "") ?? []);
      } else if (ownedClinics.has(uid)) {
        kind = "client";
        clinics = ownedClinics.get(uid) ?? [];
      }
      map[uid] = { kind, name, clinics };
    }
    // Alias by email so rows without a stored user_id still resolve.
    emailToUser.forEach((uid, mail) => {
      if (map[uid]) map[mail] = map[uid];
    });
    setIdentities(map);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 3_600_000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "failed" && r.success) return false;
      if (filter === "success" && !r.success) return false;
      if (!q) return true;
      return [r.email, r.error_message, r.error_code, r.context, r.route, r.failure_kind]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  const stats = useMemo(() => {
    const recent = (rows ?? []).filter((r) => Date.now() - new Date(r.created_at).getTime() < 86400000);
    return {
      total: recent.length,
      failed: recent.filter((r) => !r.success).length,
      success: recent.filter((r) => r.success).length,
    };
  }, [rows]);

  return (
    <div className="container mx-auto py-6 sm:py-8 px-4 sm:px-6 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Login Activity &amp; Errors</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every sign-in attempt with its outcome and technical reason. Visible to admins only — team members and clients
            only ever see a generic message.
            {rows && (
              <span className="ml-2">
                · last 24h: {stats.total} attempts, {stats.success} successful, {stats.failed} failed
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by email, error, code or route…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md"
        />
        <div className="flex gap-1">
          {(["all", "failed", "success"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f === "all" ? "All attempts" : f === "failed" ? "Failed" : "Successful"}
            </Button>
          ))}
        </div>
      </div>

      <Card className="glass-card overflow-hidden p-0">
        {!filtered ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <ShieldAlert className="h-6 w-6 mx-auto mb-3 opacity-50" />
            No sign-in activity recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3) }}
                className="px-4 sm:px-5 py-3"
              >
                <button
                  className="w-full text-left flex items-start gap-3"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  {r.success ? (
                    <CheckCircle2 className="h-4 w-4 mt-1 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-1 shrink-0 text-red-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="shrink-0">{CONTEXT_LABEL[r.context] ?? r.context}</Badge>
                      <span className="text-sm font-medium truncate">{r.email ?? "unknown email"}</span>
                      {(() => {
                        const id = identityFor(r);
                        if (!id) return null;
                        return (
                          <>
                            <Badge variant="outline" className={`shrink-0 ${KIND_BADGE_CLASS[id.kind]}`}>
                              {KIND_LABEL[id.kind]}
                            </Badge>
                            {(id.kind === "client" || id.kind === "sub_client") && id.clinics.length > 0 && (
                              <span className="text-xs text-muted-foreground truncate">
                                {id.clinics.join(", ")}
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {r.success ? (
                        <Badge className="shrink-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30" variant="outline">
                          Successful
                        </Badge>
                      ) : (
                        <Badge className="shrink-0 bg-red-500/15 text-red-500 border-red-500/30" variant="outline">
                          Failed
                        </Badge>
                      )}
                      {r.error_status ? (
                        <Badge variant="secondary" className="shrink-0">{r.error_status}</Badge>
                      ) : null}
                      {r.error_code ? (
                        <span className="text-xs text-muted-foreground">{r.error_code}</span>
                      ) : null}
                    </div>
                    {r.success ? (
                      <p className="text-sm text-muted-foreground mt-1">Signed in successfully.</p>
                    ) : (
                      <>
                        <p className="text-sm text-red-400 mt-1">
                          {REASON_LABEL[r.failure_kind ?? "unknown"] ?? r.failure_kind}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">
                          {r.error_message || "No error detail captured"}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{relative(r.created_at)}</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded === r.id ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {expanded === r.id && (
                  <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground border-t border-border/60 pt-3">
                    <div><span className="text-foreground/70">Time:</span> {new Date(r.created_at).toLocaleString()}</div>
                    {(() => {
                      const id = identityFor(r);
                      if (!id) return null;
                      return (
                        <div>
                          <span className="text-foreground/70">Account:</span>{" "}
                          {KIND_LABEL[id.kind]}
                          {id.name ? ` · ${id.name}` : ""}
                          {id.clinics.length > 0 ? ` · ${id.clinics.join(", ")}` : ""}
                        </div>
                      );
                    })()}
                    {r.friendly_message && <div><span className="text-foreground/70">Shown to user:</span> {r.friendly_message}</div>}
                    {r.route && <div><span className="text-foreground/70">Route:</span> {r.route}</div>}
                    {r.user_id && <div className="break-all"><span className="text-foreground/70">User ID:</span> {r.user_id}</div>}
                    {r.user_agent && <div className="break-all"><span className="text-foreground/70">Browser:</span> {r.user_agent}</div>}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
