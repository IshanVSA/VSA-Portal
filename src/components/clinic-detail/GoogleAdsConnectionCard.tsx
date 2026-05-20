import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, RefreshCw, Loader2, Unlink, Clock, CalendarClock } from "lucide-react";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { formatDistanceToNow, addDays, setHours, setMinutes, setSeconds, isAfter } from "date-fns";

interface GoogleAdsConnectionCardProps {
  clinicId: string;
  hasGoogleCreds: boolean;
  accountName: string | null;
  customerId: string | null;
  lastGoogleSyncAt: string | null;
  onRefresh: () => void;
}

function NextSyncTime() {
  const nextSync = useMemo(() => {
    const now = new Date();
    let next = setSeconds(setMinutes(setHours(now, 7), 0), 0); // 7:00 AM UTC
    if (isAfter(now, next)) next = addDays(next, 1);
    return next;
  }, []);
  return (
    <span className="text-foreground font-medium" title={nextSync.toLocaleString()}>
      {formatDistanceToNow(nextSync, { addSuffix: true })}
    </span>
  );
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

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const origin = encodeURIComponent(window.location.origin);
  const oauthUrl = `${supabaseUrl}/functions/v1/google-oauth?action=authorize&clinic_id=${clinicId}&origin=${origin}`;

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Ads</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasGoogleCreds ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground text-sm">Not connected</span>
            </div>
            <Button className="w-full" onClick={() => { window.location.href = oauthUrl; }}>
              Connect Google Ads
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-foreground text-sm font-medium">
                {accountName || "Connected"}
              </span>
              <Badge variant="secondary" className="text-xs">Connected</Badge>
            </div>

            <div className="rounded-xl bg-muted/50 p-3 space-y-2 text-xs">
              {customerId && (
                <p className="text-muted-foreground">Customer ID: {customerId}</p>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Last synced: </span>
                {lastGoogleSyncAt ? (
                  <span className="text-foreground font-medium" title={new Date(lastGoogleSyncAt).toLocaleString()}>
                    {formatDistanceToNow(new Date(lastGoogleSyncAt), { addSuffix: true })}
                  </span>
                ) : (
                  <span className="text-amber-500 font-medium">Never</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                <span>Next auto-sync: </span>
                <NextSyncTime />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="flex-1">
                {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Sync Now
              </Button>
              <Button onClick={handleDisconnect} disabled={disconnecting} variant="destructive" size="sm" className="flex-1">
                {disconnecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Unlink className="h-4 w-4 mr-1" />}
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
