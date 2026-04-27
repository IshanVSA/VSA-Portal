import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, RefreshCw, Loader2, Unlink } from "lucide-react";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";

interface MetaConnectionCardProps {
  clinicId: string;
  hasMetaCreds: boolean;
  metaPageName: string | null;
  metaPageId: string | null;
  metaInstagramBusinessId: string | null;
  lastMetaSyncAt: string | null;
  grantedScopes?: string[] | null;
  onRefresh: () => void;
}

export function MetaConnectionCard({
  clinicId,
  hasMetaCreds,
  metaPageName,
  metaPageId,
  metaInstagramBusinessId,
  lastMetaSyncAt,
  grantedScopes,
  onRefresh,
}: MetaConnectionCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const origin = encodeURIComponent(window.location.origin);
  const oauthUrl = `${supabaseUrl}/functions/v1/meta-oauth?action=authorize&clinic_id=${clinicId}&origin=${origin}`;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("sync-meta-analytics", {
        body: { clinic_id: clinicId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractEdgeFunctionError(res.error, res.data, "Analytics sync failed"));
      toast.success("Analytics synced successfully!");
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
      const res = await supabase.functions.invoke("meta-oauth", {
        body: { clinic_id: clinicId },
        headers: { "x-action": "disconnect" },
      });
      // The disconnect action is called via POST with action=disconnect query param
      const response = await fetch(
        `${supabaseUrl}/functions/v1/meta-oauth?action=disconnect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clinic_id: clinicId }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      toast.success("Meta account disconnected");
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
        <CardTitle className="text-base">Meta (Instagram + Facebook)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasMetaCreds ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground text-sm">Not connected</span>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1.5">
              <p className="font-semibold text-foreground">Setup requirements (Dev Mode)</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>App must be in <strong>Development Mode</strong> (Live toggle OFF)</li>
                <li>Add the Page admin as an <strong>App Tester</strong> in App Roles → Roles at developers.facebook.com</li>
                <li>Connect using that admin's Facebook account below</li>
              </ol>
              <p className="text-muted-foreground pt-1">This unlocks full insights, demographics, and per-post metrics without Business Verification.</p>
            </div>
            <Button className="w-full" onClick={() => { window.location.href = oauthUrl; }}>
              Connect with Facebook
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-foreground text-sm font-medium">
                {metaPageName || "Connected"}
              </span>
              <Badge variant="secondary" className="text-xs">Connected</Badge>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              {metaPageId && <p>Page ID: {metaPageId}</p>}
              {metaInstagramBusinessId && <p>Instagram ID: {metaInstagramBusinessId}</p>}
              {lastMetaSyncAt && (
                <p>Last synced: {new Date(lastMetaSyncAt).toLocaleString()}</p>
              )}
            </div>

            {grantedScopes && grantedScopes.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-foreground">Granted permissions</p>
                <div className="flex flex-wrap gap-1">
                  {grantedScopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="text-[10px] font-mono">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

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
