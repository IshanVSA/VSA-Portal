import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GoogleAccount {
  customer_id: string;
  name: string;
  login_customer_id: string;
}

interface GoogleAccountSelectionDialogProps {
  open: boolean;
  accounts: GoogleAccount[];
  refreshToken: string;
  clinicId: string;
  clinicName?: string;
  onClose: () => void;
  onConnected: () => void;
}

function getMatchScore(accountName: string, clinicName: string): number {
  if (!clinicName.trim()) return 0;
  const accLower = accountName.toLowerCase();
  const clinicLower = clinicName.toLowerCase().trim();

  // Exact match
  if (accLower === clinicLower) return 3;
  // Account contains full clinic name
  if (accLower.includes(clinicLower)) return 2;
  // Check significant words (3+ chars)
  const words = clinicLower.split(/\s+/).filter(w => w.length >= 3);
  const matched = words.filter(w => accLower.includes(w));
  if (matched.length > 0) return matched.length / words.length;
  return 0;
}

export function GoogleAccountSelectionDialog({
  open,
  accounts,
  refreshToken,
  clinicId,
  clinicName = "",
  onClose,
  onConnected,
}: GoogleAccountSelectionDialogProps) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const scoredAccounts = useMemo(() => {
    return accounts.map(a => ({
      ...a,
      score: getMatchScore(a.name, clinicName),
    }));
  }, [accounts, clinicName]);

  const filteredAndSorted = useMemo(() => {
    const filtered = scoredAccounts.filter(
      (a) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.customer_id.includes(search)
    );
    return filtered.sort((a, b) => b.score - a.score);
  }, [scoredAccounts, search]);

  // Auto-select best match on first render
  useState(() => {
    const best = scoredAccounts.find(a => a.score >= 1);
    if (best && !selectedId) setSelectedId(best.customer_id);
  });

  const handleConnect = async () => {
    const account = accounts.find((a) => a.customer_id === selectedId);
    if (!account) return;

    setSaving(true);
    const { error } = await supabase.functions.invoke("save-google-account", {
      body: {
        clinic_id: clinicId,
        customer_id: account.customer_id,
        account_name: account.name,
        refresh_token: refreshToken,
        login_customer_id: account.login_customer_id,
      },
    });
    setSaving(false);

    if (error) {
      toast.error("Failed to save account: " + error.message);
      return;
    }

    toast.success(`Connected to ${account.name}`);
    onConnected();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select a Google Ads Account</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose which Google Ads account to connect to this clinic.
          </p>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="max-h-[50vh] pr-4">
          <RadioGroup value={selectedId} onValueChange={setSelectedId} className="space-y-2 my-4">
            {filteredAndSorted.map((account) => (
              <label
                key={account.customer_id}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedId === account.customer_id
                    ? "border-primary bg-primary/5"
                    : account.score >= 1
                      ? "border-green-500/40 bg-green-500/5 hover:border-green-500/60"
                      : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value={account.customer_id} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">{account.name}</p>
                    {account.score >= 1 && (
                      <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                        Suggested
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">ID: {account.customer_id}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleConnect} disabled={!selectedId || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Connect Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
