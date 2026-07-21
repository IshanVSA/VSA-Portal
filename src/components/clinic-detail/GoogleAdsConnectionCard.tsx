import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw, Loader2, Unlink, Clock, CalendarClock, Megaphone, Hash, KeyRound } from "lucide-react";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { formatDistanceToNow, addDays, setHours, setMinutes, setSeconds, isAfter } from "date-fns";
import { IOSGroup, IOSRow } from "@/components/ui/ios-list";

interface GoogleAdsConnectionCardProps {
  clinicId: string;
  hasGoogleCreds: boolean;
  accountName: string | null;
  customerId: string | null;
  lastGoogleSyncAt: string | null;
  onRefresh: () => void;
}

export function GoogleAdsConnectionCard({
  clinicId,
  hasGoogleCreds,
  accountName,
  customerId,
  lastGoogleSyncAt,
  onRefresh,
}: GoogleAdsConnectionCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [reusing, setReusing] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const origin = encodeURIComponent(window.location.origin);
  const oauthUrl = `${supabaseUrl}/functions/v1/google-oauth?action=authorize&clinic_id=${clinicId}&origin=${origin}`;

  const nextSync = useMemo(() => {
    const now = new Date();
    let next = setSeconds(setMinutes(setHours(now, 7), 0), 0);
    if (isAfter(now, next)) next = addDays(next, 1);
    return next;
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("sync-google-ads", {
        body: { clinic_id: clinicId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractEdgeFunctionError(res.error, res.data, "Google Ads sync failed"));
      toast.success("Google Ads analytics synced!");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleUseExisting = async () => {
    setReusing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/google-oauth?action=use_existing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ clinic_id: clinicId }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not reuse saved connection");
      window.location.href = `/clinics/${clinicId}?google_token_ref=${result.token_ref}`;
    } catch (e: any) {
      toast.error(e.message || "Could not reuse saved Google Ads connection");
    } finally {
      setReusing(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/google-oauth?action=disconnect`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ clinic_id: clinicId }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast.success("Google Ads disconnected");
      onRefresh();
    } catch (e: any) {
      toast.error("Disconnect failed: " + (e.message || "Unknown error"));
    } finally {
      setDisconnecting(false);
    }
  };

  if (!hasGoogleCreds) {
    return (
      <IOSGroup header="Google Ads">
        <IOSRow icon={<Megaphone />} tone="yellow" label="Status" value="Not connected" />
        <IOSRow
          icon={reusing ? <Loader2 className="animate-spin" /> : <KeyRound />}
          tone="green"
          label="Use saved admin connection"
          sublabel="Skip Google verification when admin@vsavetmedia.com is already connected"
          onClick={reusing ? undefined : handleUseExisting}
        />
        <IOSRow
          centered
          label={<span className="text-primary font-medium">Connect Google Ads</span>}
          onClick={() => { window.location.href = oauthUrl; }}
        />
      </IOSGroup>
    );
  }

  return (
    <IOSGroup header="Google Ads">
      <IOSRow
        icon={<CheckCircle2 />}
        tone="green"
        label={accountName || "Connected"}
        sublabel="Active connection"
      />
      {customerId && (
        <IOSRow icon={<Hash />} tone="gray" label="Customer ID" value={<span className="font-mono text-xs">{customerId}</span>} />
      )}
      <IOSRow
        icon={<Clock />}
        tone="indigo"
        label="Last synced"
        value={lastGoogleSyncAt
          ? formatDistanceToNow(new Date(lastGoogleSyncAt), { addSuffix: true })
          : <span className="text-[hsl(var(--ios-yellow))]">Never</span>}
      />
      <IOSRow
        icon={<CalendarClock />}
        tone="blue"
        label="Next auto-sync"
        value={formatDistanceToNow(nextSync, { addSuffix: true })}
      />
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
