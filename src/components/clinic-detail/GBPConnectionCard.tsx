import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Unlink, MapPin, AlertTriangle, Hash, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { IOSGroup, IOSRow } from "@/components/ui/ios-list";

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

  if (!hasGbpCreds) {
    return (
      <IOSGroup
        header="Google Business Profile"
        footer="Approved posts will auto-publish at their scheduled time. Requires Google's Business Profile APIs production access; test accounts work without approval."
      >
        <IOSRow icon={<MapPin />} tone="blue" label="Status" value="Not connected" />
        <IOSRow
          icon={<AlertTriangle />}
          tone="yellow"
          label="Production access required"
          sublabel="Test accounts work without approval"
        />
        <IOSRow
          centered
          label={<span className="text-primary font-medium">Connect Google Business Profile</span>}
          onClick={() => { window.location.href = oauthUrl; }}
        />
      </IOSGroup>
    );
  }

  return (
    <IOSGroup
      header="Google Business Profile"
      footer="Approved posts auto-publish at their scheduled time (every 15 min check)."
    >
      <IOSRow
        icon={<CheckCircle2 />}
        tone="green"
        label={locationName || "Connected"}
        sublabel="Active connection"
      />
      {locationId && (
        <IOSRow icon={<Hash />} tone="gray" label="Location ID" value={<span className="font-mono text-xs">{locationId}</span>} />
      )}
      {connectedAt && (
        <IOSRow
          icon={<Clock />}
          tone="indigo"
          label="Connected"
          value={formatDistanceToNow(new Date(connectedAt), { addSuffix: true })}
        />
      )}
      <div className="flex gap-2 p-3">
        <Button onClick={() => { window.location.href = oauthUrl; }} variant="outline" size="sm" className="flex-1 rounded-xl">
          Reconnect
        </Button>
        <Button onClick={handleDisconnect} disabled={disconnecting} variant="destructive" size="sm" className="flex-1 rounded-xl">
          {disconnecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Unlink className="h-4 w-4 mr-1" />}
          Disconnect
        </Button>
      </div>
    </IOSGroup>
  );
}
