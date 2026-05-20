import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Check, Handshake, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ClinicOption {
  id: string;
  clinic_name: string;
  owner_user_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientUserId: string | null;
  clientName: string;
  allClinics: ClinicOption[];
  onSaved?: () => void;
}

export function PartnershipsDialog({ open, onOpenChange, clientUserId, clientName, allClinics, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partneredIds, setPartneredIds] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || !clientUserId) return;
    setLoading(true);
    setQuery("");
    (async () => {
      const { data, error } = await (supabase as any)
        .from("clinic_partners")
        .select("clinic_id")
        .eq("user_id", clientUserId);
      if (error) toast.error(error.message);
      const ids = new Set<string>((data ?? []).map((r: any) => r.clinic_id));
      setPartneredIds(ids);
      setInitial(new Set(ids));
      setLoading(false);
    })();
  }, [open, clientUserId]);

  const toggle = (id: string) => {
    setPartneredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredClinics = allClinics
    // Hide clinics this user already owns — those don't need a partnership row.
    .filter((c) => c.owner_user_id !== clientUserId)
    .filter((c) => c.clinic_name.toLowerCase().includes(query.trim().toLowerCase()));

  const dirty = partneredIds.size !== initial.size
    || [...partneredIds].some((id) => !initial.has(id));

  const handleSave = async () => {
    if (!clientUserId) return;
    setSaving(true);
    const toAdd = [...partneredIds].filter((id) => !initial.has(id));
    const toRemove = [...initial].filter((id) => !partneredIds.has(id));

    if (toRemove.length > 0) {
      const { error } = await (supabase as any)
        .from("clinic_partners")
        .delete()
        .eq("user_id", clientUserId)
        .in("clinic_id", toRemove);
      if (error) { setSaving(false); toast.error(error.message); return; }
    }
    if (toAdd.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      const rows = toAdd.map((cid) => ({ clinic_id: cid, user_id: clientUserId, created_by: user?.id ?? null }));
      const { error } = await (supabase as any).from("clinic_partners").insert(rows);
      if (error) { setSaving(false); toast.error(error.message); return; }
    }
    setSaving(false);
    toast.success(`Partnerships updated for ${clientName}`);
    setInitial(new Set(partneredIds));
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-primary" />
            Manage partnerships
          </DialogTitle>
          <DialogDescription>
            Grant <span className="font-medium text-foreground">{clientName}</span> the same access as the owner on additional clinics. Their own clinics aren't shown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clinics..."
              className="h-9 pl-8 text-sm"
            />
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-2 w-full">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filteredClinics.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No clinics match.</div>
          ) : (
            <ScrollArea className="h-72 rounded-xl border border-border/60">
              <ul className="divide-y divide-border/60">
                {filteredClinics.map((c) => {
                  const checked = partneredIds.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors",
                          checked && "bg-primary/5"
                        )}
                      >
                        <div className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border border-primary/40 shrink-0",
                          checked && "bg-primary text-primary-foreground border-primary"
                        )}>
                          {checked && <Check className="h-3 w-3" />}
                        </div>
                        <span className="flex-1 truncate text-sm">{c.clinic_name}</span>
                        {c.owner_user_id && (
                          <Badge variant="outline" className="text-[10px] rounded-full">Has owner</Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}

          <p className="text-[11px] text-muted-foreground">
            Partners get the same view and edit access as the clinic's owner across content, tickets, analytics, and brand DNA.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="w-full sm:w-auto" onClick={handleSave} disabled={!dirty || saving || loading}>
            {saving ? "Saving…" : "Save partnerships"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
