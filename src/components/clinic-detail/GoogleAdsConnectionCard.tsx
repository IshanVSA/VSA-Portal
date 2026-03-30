import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, RefreshCw, Loader2, Unlink, Clock, CalendarClock } from "lucide-react";
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
      if (res.error) throw res.error;
      toast.success("Google Ads analytics synced!");
      onRefresh();
    } catch (e: any) {
      toast.error("Sync failed: " + (e.message || "Unknown error"));
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

            <div className="space-y-1 text-xs text-muted-foreground">
              {customerId && <p>Customer ID: {customerId}</p>}
              {lastGoogleSyncAt && (
                <p>Last synced: {new Date(lastGoogleSyncAt).toLocaleString()}</p>
              )}
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
