import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ShieldAlert, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";

interface AuthErrorRow {
  id: string;
  created_at: string;
  context: string;
  email: string | null;
  user_id: string | null;
  error_code: string | null;
  error_status: number | null;
  error_message: string | null;
  friendly_message: string | null;
  user_agent: string | null;
  route: string | null;
}

const CONTEXT_LABEL: Record<string, string> = {
  login: "Sign in",
  password_reset: "Password reset",
  session_recovery: "Session recovery",
};

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
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from("auth_error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data as AuthErrorRow[]) ?? []);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.email, r.error_message, r.error_code, r.context, r.route]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, query]);

  const last24h = useMemo(
    () => (rows ?? []).filter((r) => Date.now() - new Date(r.created_at).getTime() < 86400000).length,
    [rows]
  );

  return (
    <div className="container mx-auto py-6 sm:py-8 px-4 sm:px-6 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Login Errors</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Technical sign-in failures. Visible to admins only — team members and clients only ever see a generic message.
            {rows && <span className="ml-2">· {last24h} in the last 24h</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Input
        placeholder="Search by email, error, code or route…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      <Card className="glass-card overflow-hidden p-0">
        {!filtered ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <ShieldAlert className="h-6 w-6 mx-auto mb-3 opacity-50" />
            No sign-in errors recorded.
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="shrink-0">{CONTEXT_LABEL[r.context] ?? r.context}</Badge>
                      <span className="text-sm font-medium truncate">{r.email ?? "unknown email"}</span>
                      {r.error_status ? (
                        <Badge variant="secondary" className="shrink-0">{r.error_status}</Badge>
                      ) : null}
                      {r.error_code ? (
                        <span className="text-xs text-muted-foreground">{r.error_code}</span>
                      ) : null}
                    </div>
                    <p className="text-sm text-red-400 mt-1 break-words">
                      {r.error_message || "No error detail captured"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{relative(r.created_at)}</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded === r.id ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {expanded === r.id && (
                  <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground border-t border-border/60 pt-3">
                    <div><span className="text-foreground/70">Time:</span> {new Date(r.created_at).toLocaleString()}</div>
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
