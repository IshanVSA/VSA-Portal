import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2, Unlink, MapPin, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Props {
  clinicId: string;
  hasGbpCreds: boolean;
  locationName: string | null;
  locationId: string | null;
  connectedAt: string | null;
  onRefresh: () => void;
}

export function GBPConnectionCard({
  clinicId, hasGbpCreds, locationName, locationId, connectedAt, onRefresh,
}: Props) {
  const [disconnecting, setDisconnecting] = useState(false);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const origin = encodeURIComponent(window.location.origin);
  const oauthUrl = `${supabaseUrl}/functions/v1/gbp-oauth?action=authorize&clinic_id=${clinicId}&origin=${origin}`;

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/gbp-oauth?action=disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clinic_id: clinicId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast.success("Google Business Profile disconnected");
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
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Google Business Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasGbpCreds ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground text-sm">Not connected</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Connect this clinic's GBP location to enable automatic publishing of approved posts.
            </p>
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Requires Google's "Business Profile APIs" production access. Test accounts work without approval.</span>
            </div>
            <Button className="w-full" onClick={() => { window.location.href = oauthUrl; }}>
              Connect Google Business Profile
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-foreground text-sm font-medium">
                {locationName || "Connected"}
              </span>
              <Badge variant="secondary" className="text-xs">Connected</Badge>
            </div>

            <div className="rounded-xl bg-muted/50 p-3 space-y-1.5 text-xs text-muted-foreground">
              {locationId && <p>Location: {locationId}</p>}
              {connectedAt && (
                <p>
                  Connected {formatDistanceToNow(new Date(connectedAt), { addSuffix: true })}
                </p>
              )}
              <p>Approved posts will auto-publish at their scheduled time (every 15 min check).</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => { window.location.href = oauthUrl; }} variant="outline" size="sm" className="flex-1">
                Reconnect
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
