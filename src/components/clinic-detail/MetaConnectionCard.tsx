import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, RefreshCw, Loader2, Unlink, Facebook, Hash, Instagram, Clock, KeyRound, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { IOSGroup, IOSRow } from "@/components/ui/ios-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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

interface AdAccount {
  id: string;
  account_id?: string;
  name?: string;
  currency?: string;
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
  const [adAccountId, setAdAccountId] = useState<string | null>(null);
  const [adAccountName, setAdAccountName] = useState<string | null>(null);
  const [hasUserToken, setHasUserToken] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    if (!hasMetaCreds) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("clinic_api_credentials")
        .select("meta_ad_account_id, meta_ad_account_name, meta_user_access_token")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (!active) return;
      setAdAccountId((data as any)?.meta_ad_account_id ?? null);
      setAdAccountName((data as any)?.meta_ad_account_name ?? null);
      setHasUserToken(!!(data as any)?.meta_user_access_token);
    })();
    return () => { active = false; };
  }, [clinicId, hasMetaCreds, lastMetaSyncAt]);

  const openPicker = async () => {
    setPickerOpen(true);
    setLoadingAccounts(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("meta-ads-accounts", {
        body: { clinic_id: clinicId, action: "list" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractEdgeFunctionError(res.error, res.data, "Could not load ad accounts"));
      setAccounts(res.data?.accounts || []);
      setSelectedAccount(adAccountId || res.data?.accounts?.[0]?.id || "");
    } catch (e: any) {
      toast.error(e.message || "Could not load ad accounts");
      setPickerOpen(false);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const saveAccount = async () => {
    const acc = accounts.find((a) => a.id === selectedAccount);
    if (!acc) return;
    setSavingAccount(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("meta-ads-accounts", {
        body: { clinic_id: clinicId, action: "save", ad_account_id: acc.id, ad_account_name: acc.name },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(await extractEdgeFunctionError(res.error, res.data, "Save failed"));
      setAdAccountId(acc.id);
      setAdAccountName(acc.name || null);
      setPickerOpen(false);
      toast.success("Ad account linked. Run a sync to pull Meta Ads metrics.");
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSavingAccount(false);
    }
  };

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

  if (!hasMetaCreds) {
    return (
      <IOSGroup
        header="Meta (Instagram + Facebook)"
        footer="App must be in Development Mode with the Page admin added as an App Tester. Unlocks full insights, demographics, and per-post metrics without Business Verification."
      >
        <IOSRow icon={<Facebook />} tone="blue" label="Status" value="Not connected" />
        <IOSRow
          centered
          label={<span className="text-primary font-medium">Connect with Facebook</span>}
          onClick={() => { window.location.href = oauthUrl; }}
        />
      </IOSGroup>
    );
  }

  return (
    <IOSGroup header="Meta (Instagram + Facebook)">
      <IOSRow
        icon={<CheckCircle2 />}
        tone="green"
        label={metaPageName || "Connected"}
        sublabel="Active connection"
      />
      {metaPageId && (
        <IOSRow icon={<Facebook />} tone="blue" label="Page ID" value={<span className="font-mono text-xs">{metaPageId}</span>} />
      )}
      {metaInstagramBusinessId && (
        <IOSRow icon={<Instagram />} tone="pink" label="Instagram ID" value={<span className="font-mono text-xs">{metaInstagramBusinessId}</span>} />
      )}
      {lastMetaSyncAt && (
        <IOSRow
          icon={<Clock />}
          tone="indigo"
          label="Last synced"
          value={new Date(lastMetaSyncAt).toLocaleString()}
        />
      )}
      {grantedScopes && grantedScopes.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[13px] text-foreground/90">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            Granted permissions
          </div>
          <div className="flex flex-wrap gap-1">
            {grantedScopes.map((scope) => (
              <Badge key={scope} variant="outline" className="text-[10px] font-mono rounded-md">
                {scope}
              </Badge>
            ))}
          </div>
        </div>
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
