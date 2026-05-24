import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw, Loader2, Unlink, Clock, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { IOSGroup, IOSRow } from "@/components/ui/ios-list";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";

interface Props { clinicId: string; onRefresh?: () => void; }
interface Creds {
  site_url: string | null;
  site_display_name: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

export function GSCConnectionCard({ clinicId, onRefresh }: Props) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const origin = encodeURIComponent(window.location.origin);
  const oauthUrl = `${supabaseUrl}/functions/v1/gsc-oauth?action=authorize&clinic_id=${clinicId}&origin=${origin}`;

  const fetchCreds = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("clinic_gsc_credentials")
      .select("site_url, site_display_name, last_sync_at, last_sync_status, last_sync_error")
      .eq("clinic_id", clinicId).maybeSingle();
    setCreds(data as Creds | null);
    setLoading(false);
  };

  useEffect(() => { fetchCreds(); /* eslint-disable-next-line */ }, [clinicId]);

  const hasCreds = !!creds?.site_url;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("sync-gsc", {
        body: { clinic_id: clinicId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractEdgeFunctionError(res.error, res.data, "GSC sync failed"));
      toast.success("Search Console synced");
      fetchCreds(); onRefresh?.();
    } catch (e: any) { toast.error(e.message || "Sync failed"); }
    finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/gsc-oauth?action=disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ clinic_id: clinicId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success("Search Console disconnected");
      fetchCreds(); onRefresh?.();
    } catch (e: any) { toast.error("Disconnect failed: " + (e.message || "Unknown error")); }
    finally { setDisconnecting(false); }
  };

  if (loading) {
    return <IOSGroup header="Google Search Console"><IOSRow icon={<Loader2 className="animate-spin" />} tone="gray" label="Loading…" /></IOSGroup>;
  }

  if (!hasCreds) {
    return (
      <IOSGroup header="Google Search Console">
        <IOSRow icon={<Search />} tone="yellow" label="Status" value="Not connected" />
        <IOSRow centered label={<span className="text-primary font-medium">Connect Search Console</span>} onClick={() => { window.location.href = oauthUrl; }} />
      </IOSGroup>
    );
  }

  return (
    <IOSGroup header="Google Search Console">
      <IOSRow icon={<CheckCircle2 />} tone="green" label={creds?.site_display_name || "Connected"} sublabel={creds?.site_url || undefined} />
      <IOSRow icon={<Clock />} tone="indigo" label="Last synced" value={creds?.last_sync_at ? formatDistanceToNow(new Date(creds.last_sync_at), { addSuffix: true }) : <span className="text-[hsl(var(--ios-yellow))]">Never</span>} />
      {creds?.last_sync_status && creds.last_sync_status !== "ok" && (
        <IOSRow icon={<RefreshCw />} tone="yellow" label="Last status" value={creds.last_sync_status} sublabel={creds.last_sync_error || undefined} />
      )}
      <div className="flex gap-2 p-3">
        <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="flex-1 rounded-xl">
          {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Sync Now
        </Button>
        <Button onClick={handleDisconnect} disabled={disconnecting} variant="destructive" size="sm" className="flex-1 rounded-xl">
          {disconnecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Unlink className="h-4 w-4 mr-1" />} Disconnect
        </Button>
      </div>
    </IOSGroup>
  );
}
