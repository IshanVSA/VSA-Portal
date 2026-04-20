import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GBPLocation {
  account_id: string;
  location_id: string;
  location_name: string;
  address: string;
}

interface Props {
  open: boolean;
  locations: GBPLocation[];
  refreshToken: string;
  clinicId: string;
  clinicName?: string;
  onClose: () => void;
  onConnected: () => void;
}

function getMatchScore(name: string, clinicName: string): number {
  if (!clinicName.trim()) return 0;
  const a = name.toLowerCase();
  const c = clinicName.toLowerCase().trim();
  if (a === c) return 3;
  if (a.includes(c)) return 2;
  const words = c.split(/\s+/).filter((w) => w.length >= 3);
  const matched = words.filter((w) => a.includes(w));
  if (matched.length > 0) return matched.length / words.length;
  return 0;
}

export function GBPLocationSelectionDialog({
  open, locations, refreshToken, clinicId, clinicName = "", onClose, onConnected,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const scored = useMemo(
    () => locations.map((l) => ({ ...l, score: getMatchScore(l.location_name, clinicName) })),
    [locations, clinicName]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return scored
      .filter((l) => l.location_name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score);
  }, [scored, search]);

  useState(() => {
    const best = scored.find((l) => l.score >= 1);
    if (best && !selectedId) setSelectedId(best.location_id);
  });

  const handleConnect = async () => {
    const loc = locations.find((l) => l.location_id === selectedId);
    if (!loc) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/gbp-oauth?action=save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          clinic_id: clinicId,
          account_id: loc.account_id,
          location_id: loc.location_id,
          location_name: loc.location_name,
          refresh_token: refreshToken,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save");
      toast.success(`Connected to ${loc.location_name}`);
      onConnected();
    } catch (e: any) {
      toast.error("Failed to save: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select a Google Business Profile location</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose which GBP location to publish to for this clinic.
          </p>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search locations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="max-h-[50vh] pr-4">
          <RadioGroup value={selectedId} onValueChange={setSelectedId} className="space-y-2 my-4">
            {filtered.map((loc) => (
              <label
                key={loc.location_id}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedId === loc.location_id
                    ? "border-primary bg-primary/5"
                    : loc.score >= 1
                      ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                      : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value={loc.location_id} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">{loc.location_name}</p>
                    {loc.score >= 1 && (
                      <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shrink-0">
                        Suggested
                      </Badge>
                    )}
                  </div>
                  {loc.address && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" /> {loc.address}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </RadioGroup>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleConnect} disabled={!selectedId || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Connect Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
