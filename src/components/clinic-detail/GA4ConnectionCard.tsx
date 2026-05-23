import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw, Loader2, Unlink, Clock, CalendarClock, BarChart3, Hash } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, addDays, setHours, setMinutes, setSeconds, isAfter } from "date-fns";
import { IOSGroup, IOSRow } from "@/components/ui/ios-list";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";

interface Props {
  clinicId: string;
  onRefresh?: () => void;
}

interface Creds {
  ga4_property_id: string | null;
  ga4_property_display_name: string | null;
  ga4_account_display_name: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

export function GA4ConnectionCard({ clinicId, onRefresh }: Props) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const origin = encodeURIComponent(window.location.origin);
  const oauthUrl = `${supabaseUrl}/functions/v1/ga4-oauth?action=authorize&clinic_id=${clinicId}&origin=${origin}`;

  const nextSync = useMemo(() => {
    const now = new Date();
    let next = setSeconds(setMinutes(setHours(now, 7), 30), 0);
    if (isAfter(now, next)) next = addDays(next, 1);
    return next;
  }, []);

  const fetchCreds = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clinic_ga4_credentials")
      .select("ga4_property_id, ga4_property_display_name, ga4_account_display_name, last_sync_at, last_sync_status, last_sync_error")
      .eq("clinic_id", clinicId)
      .maybeSingle();
    setCreds(data as Creds | null);
    setLoading(false);
  };

  useEffect(() => { fetchCreds(); /* eslint-disable-next-line */ }, [clinicId]);

  const hasCreds = !!creds?.ga4_property_id;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("sync-ga4-traffic", {
        body: { clinic_id: clinicId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractEdgeFunctionError(res.error, res.data, "GA4 sync failed"));
      toast.success("Google Analytics synced");
      fetchCreds();
      onRefresh?.();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/ga4-oauth?action=disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clinic_id: clinicId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Google Analytics disconnected");
      fetchCreds();
      onRefresh?.();
    } catch (e: any) {
      toast.error("Disconnect failed: " + (e.message || "Unknown error"));
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <IOSGroup header="Google Analytics (GA4)">
        <IOSRow icon={<Loader2 className="animate-spin" />} tone="gray" label="Loading…" />
      </IOSGroup>
    );
  }

  if (!hasCreds) {
    return (
      <IOSGroup header="Google Analytics (GA4)">
        <IOSRow icon={<BarChart3 />} tone="yellow" label="Status" value="Not connected" />
        <IOSRow
          centered
          label={<span className="text-primary font-medium">Connect Google Analytics</span>}
          onClick={() => { window.location.href = oauthUrl; }}
        />
      </IOSGroup>
    );
  }

  return (
    <IOSGroup header="Google Analytics (GA4)">
      <IOSRow icon={<CheckCircle2 />} tone="green" label={creds?.ga4_property_display_name || "Connected"} sublabel={creds?.ga4_account_display_name || "Active connection"} />
      {creds?.ga4_property_id && (
        <IOSRow icon={<Hash />} tone="gray" label="Property ID" value={<span className="font-mono text-xs">{creds.ga4_property_id}</span>} />
      )}
      <IOSRow
        icon={<Clock />}
        tone="indigo"
        label="Last synced"
        value={creds?.last_sync_at
          ? formatDistanceToNow(new Date(creds.last_sync_at), { addSuffix: true })
          : <span className="text-[hsl(var(--ios-yellow))]">Never</span>}
      />
      <IOSRow icon={<CalendarClock />} tone="blue" label="Next auto-sync" value={formatDistanceToNow(nextSync, { addSuffix: true })} />
      {creds?.last_sync_status && creds.last_sync_status !== "ok" && (
        <IOSRow icon={<RefreshCw />} tone="yellow" label="Last status" value={creds.last_sync_status} sublabel={creds.last_sync_error || undefined} />
      )}
      <div className="flex gap-2 p-3">
        <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="flex-1 rounded-xl">
          {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Sync Now
        </Button>
        <Button onClick={handleDisconnect} disabled={disconnecting} variant="destructive" size="sm" className="flex-1 rounded-xl">
          {disconnecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Unlink className="h-4 w-4 mr-1" />}
          Disconnect
        </Button>
      </div>
    </IOSGroup>
  );
}
