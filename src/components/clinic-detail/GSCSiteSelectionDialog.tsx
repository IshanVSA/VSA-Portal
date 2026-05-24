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

export interface GscSite { site_url: string; permission_level: string; }

interface Props {
  open: boolean;
  sites: GscSite[];
  refreshToken: string;
  clinicId: string;
  clinicWebsite?: string;
  onClose: () => void;
  onConnected: () => void;
}

function getMatchScore(siteUrl: string, website: string): number {
  if (!website.trim()) return 0;
  try {
    const w = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase();
    const s = siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();
    if (s === w) return 3;
    if (s.includes(w) || w.includes(s)) return 2;
    return 0;
  } catch { return 0; }
}

export function GSCSiteSelectionDialog({ open, sites, refreshToken, clinicId, clinicWebsite = "", onClose, onConnected }: Props) {
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const scored = useMemo(() => sites.map(s => ({ ...s, score: getMatchScore(s.site_url, clinicWebsite) })), [sites, clinicWebsite]);
  const filtered = useMemo(() => {
    const f = scored.filter(s => s.site_url.toLowerCase().includes(search.toLowerCase()));
    return f.sort((a, b) => b.score - a.score);
  }, [scored, search]);

  useEffect(() => {
    if (!selected) {
      const best = scored.find(s => s.score >= 2);
      if (best) setSelected(best.site_url);
    }
  }, [scored, selected]);

  const handleConnect = async () => {
    const s = sites.find(x => x.site_url === selected);
    if (!s) return;
    setSaving(true);
    const display = s.site_url.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    const { error } = await supabase.functions.invoke("gsc-save-site", {
      body: { clinic_id: clinicId, site_url: s.site_url, site_display_name: display, refresh_token: refreshToken },
    });
    setSaving(false);
    if (error) { toast.error("Failed to save site: " + error.message); return; }
    toast.success(`Connected Search Console · ${display}`);
    onConnected();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select a Search Console site</DialogTitle>
          <p className="text-sm text-muted-foreground">Choose the verified property to connect to this clinic.</p>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search sites..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <ScrollArea className="max-h-[50vh] pr-4">
          <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2 my-4">
            {filtered.map((s) => (
              <label key={s.site_url} className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                selected === s.site_url ? "border-primary bg-primary/5"
                  : s.score >= 2 ? "border-green-500/40 bg-green-500/5 hover:border-green-500/60"
                  : "border-border hover:border-muted-foreground/30"
              }`}>
                <RadioGroupItem value={s.site_url} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">{s.site_url}</p>
                    {s.score >= 2 && <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">Suggested</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{s.permission_level}</p>
                </div>
              </label>
            ))}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No matching sites.</p>}
          </RadioGroup>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleConnect} disabled={!selected || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Connect Site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
