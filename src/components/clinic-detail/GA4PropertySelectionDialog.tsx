import { useState, useMemo, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GA4Property {
  property: string;
  property_id: string;
  display_name: string;
  account_name: string;
}

interface Props {
  open: boolean;
  properties: GA4Property[];
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
  const words = c.split(/\s+/).filter(w => w.length >= 3);
  const matched = words.filter(w => a.includes(w));
  return words.length === 0 ? 0 : matched.length / words.length;
}

export function GA4PropertySelectionDialog({
  open, properties, refreshToken, clinicId, clinicName = "", onClose, onConnected,
}: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const scored = useMemo(
    () => properties.map(p => ({
      ...p,
      score: Math.max(getMatchScore(p.display_name, clinicName), getMatchScore(p.account_name, clinicName)),
    })),
    [properties, clinicName]
  );

  const filtered = useMemo(() => {
    const f = scored.filter(p =>
      p.display_name.toLowerCase().includes(search.toLowerCase()) ||
      p.account_name.toLowerCase().includes(search.toLowerCase()) ||
      p.property_id.includes(search)
    );
    return f.sort((a, b) => b.score - a.score);
  }, [scored, search]);

  useEffect(() => {
    if (!selectedId) {
      const best = scored.find(p => p.score >= 1);
      if (best) setSelectedId(best.property_id);
    }
  }, [scored, selectedId]);

  const handleConnect = async () => {
    const p = properties.find(x => x.property_id === selectedId);
    if (!p) return;
    setSaving(true);
    const { error } = await supabase.functions.invoke("ga4-save-property", {
      body: {
        clinic_id: clinicId,
        property_id: p.property_id,
        property_display_name: p.display_name,
        account_display_name: p.account_name,
        refresh_token: refreshToken,
      },
    });
    setSaving(false);
    if (error) {
      toast.error("Failed to save GA4 property: " + error.message);
      return;
    }
    toast.success(`Connected GA4 · ${p.display_name}`);
    onConnected();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select a GA4 Property</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose the Google Analytics 4 property to connect to this clinic.
          </p>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search properties..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <ScrollArea className="max-h-[50vh] pr-4">
          <RadioGroup value={selectedId} onValueChange={setSelectedId} className="space-y-2 my-4">
            {filtered.map((p) => (
              <label
                key={p.property_id}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedId === p.property_id
                    ? "border-primary bg-primary/5"
                    : p.score >= 1
                      ? "border-green-500/40 bg-green-500/5 hover:border-green-500/60"
                      : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <RadioGroupItem value={p.property_id} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">{p.display_name}</p>
                    {p.score >= 1 && (
                      <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                        Suggested
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{p.account_name} · ID {p.property_id}</p>
                </div>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No matching GA4 properties.</p>
            )}
          </RadioGroup>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleConnect} disabled={!selectedId || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Connect Property
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
