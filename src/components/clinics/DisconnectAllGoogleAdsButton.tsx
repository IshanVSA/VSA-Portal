import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";

/**
 * Admin-only emergency control. Wipes Google Ads OAuth tokens from every
 * clinic so a leaked credential can no longer pull data. Each clinic must
 * be reconnected afterwards.
 */
export function DisconnectAllGoogleAdsButton() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const handleConfirm = async () => {
    setRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("disconnect-all-google-ads", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) {
        throw new Error(
          await extractEdgeFunctionError(res.error, res.data, "Bulk disconnect failed"),
        );
      }
      const affected = (res.data as any)?.affected ?? 0;
      toast.success(`Disconnected Google Ads from ${affected} clinic(s)`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Bulk disconnect failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg gap-1.5">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          Disconnect all Google Ads
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect Google Ads from every clinic?</AlertDialogTitle>
          <AlertDialogDescription>
            This wipes the stored Google Ads refresh token, customer ID and account
            name for every clinic. Use this if the agency Google account has been
            compromised. Each clinic will need to be reconnected from its detail
            page afterwards. This action is logged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={running}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {running && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Disconnect all
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
