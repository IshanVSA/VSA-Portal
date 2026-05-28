import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Settings, ListChecks, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  useChecklistStatus,
  useToggleChecklistItem,
  useChecklistNotes,
} from "@/hooks/useWebsiteChecklist";
import { useUserRole } from "@/hooks/useUserRole";
import { ChecklistItemsManagerDialog } from "./ChecklistItemsManagerDialog";
import { format } from "date-fns";

interface Props {
  clinicId: string | null;
}

function ItemNotes({
  clinicId,
  itemId,
  current,
}: {
  clinicId: string;
  itemId: string;
  current: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(current ?? "");
  const m = useChecklistNotes(clinicId);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(current ?? ""); }}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className={`h-7 w-7 ${current ? "text-primary" : "text-muted-foreground"}`}>
          <MessageSquare className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <div className="text-xs font-semibold">Notes</div>
          <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={4} placeholder="Add a note..." />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={async () => { await m.mutateAsync({ itemId, notes: val }); setOpen(false); }}>Save</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function WebsiteChecklistTab({ clinicId }: Props) {
  const { role } = useUserRole();
  const isStaff = role === "admin" || role === "concierge";
  const { data: rows = [], isLoading } = useChecklistStatus(clinicId);
  const toggle = useToggleChecklistItem(clinicId);
  const [managerOpen, setManagerOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!map.has(r.section)) map.set(r.section, []);
      map.get(r.section)!.push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  const total = rows.length;
  const done = rows.filter((r) => r.is_done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  if (!clinicId) {
    return <div className="text-sm text-muted-foreground py-12 text-center">Select a clinic to view checklist.</div>;
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[hsl(var(--dept-website))]/10 flex items-center justify-center">
              <ListChecks className="h-4.5 w-4.5 text-[hsl(var(--dept-website))]" />
            </div>
            <div>
              <CardTitle>Delivery Checklist</CardTitle>
              <div className="text-xs text-muted-foreground mt-0.5">
                {isLoading ? "Loading..." : `${done} of ${total} complete`}
              </div>
            </div>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setManagerOpen(true)}>
              <Settings className="h-4 w-4" /> Manage items
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      {grouped.map(([section, items]) => {
        const sDone = items.filter((i) => i.is_done).length;
        return (
          <Card key={section}>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">{section}</CardTitle>
              <Badge variant="secondary" className="text-xs">{sDone}/{items.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {items.map((it) => (
                <div
                  key={it.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                    it.is_done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/60 bg-card hover:bg-muted/40"
                  }`}
                >
                  <Checkbox
                    checked={it.is_done}
                    onCheckedChange={(c) => toggle.mutate({ itemId: it.id, isDone: !!c })}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${it.is_done ? "line-through text-muted-foreground" : ""}`}>
                      {it.label}
                    </div>
                    {it.is_done && it.completed_at && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {it.completed_by_name ? `by ${it.completed_by_name} · ` : ""}
                        {format(new Date(it.completed_at), "MMM d, yyyy")}
                      </div>
                    )}
                    {it.notes && (
                      <div className="text-xs text-muted-foreground mt-1 italic">{it.notes}</div>
                    )}
                  </div>
                  <ItemNotes clinicId={clinicId} itemId={it.id} current={it.notes} />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {isAdmin && <ChecklistItemsManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />}
    </div>
  );
}
