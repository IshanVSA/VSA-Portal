import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, RotateCcw, Pencil, Check, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useChecklistItems,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeactivateChecklistItem,
} from "@/hooks/useWebsiteChecklist";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DEFAULT_SECTIONS = ["Before Migration", "After Migration"];

export function ChecklistItemsManagerDialog({ open, onOpenChange }: Props) {
  const { data: items = [] } = useChecklistItems(true);
  const addItem = useAddChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deactivateItem = useDeactivateChecklistItem();

  const [newLabel, setNewLabel] = useState("");
  const [newSection, setNewSection] = useState(DEFAULT_SECTIONS[1]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSection, setEditSection] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sections = Array.from(new Set([...DEFAULT_SECTIONS, ...items.map((i) => i.section)]));

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    await addItem.mutateAsync({ section: newSection, label: newLabel.trim() });
    setNewLabel("");
  };

  const startEdit = (id: string, label: string, section: string) => {
    setEditingId(id);
    setEditLabel(label);
    setEditSection(section);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateItem.mutateAsync({ id: editingId, label: editLabel.trim(), section: editSection });
    setEditingId(null);
  };

  const grouped = sections
    .map((s) => ({ section: s, rows: items.filter((i) => i.section === s) }))
    .filter((g) => g.rows.length > 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Checklist Items</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            {grouped.map((g) => (
              <div key={g.section} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.section}
                </h4>
                <div className="space-y-1.5">
                  {g.rows.map((it) => (
                    <div
                      key={it.id}
                      className={`flex items-start gap-2 p-2.5 rounded-lg border ${
                        it.is_active ? "border-border/60 bg-card" : "border-border/40 bg-muted/30 opacity-60"
                      }`}
                    >
                      {editingId === it.id ? (
                        <div className="flex-1 space-y-2">
                          <Select value={editSection} onValueChange={setEditSection}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-9 text-sm" />
                          <div className="flex gap-1.5">
                            <Button size="sm" onClick={saveEdit}><Check className="h-3.5 w-3.5" /> Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm flex-1">{it.label}</span>
                          {!it.is_active && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(it.id, it.label, it.section)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {it.is_active ? (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setConfirmDeleteId(it.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deactivateItem.mutate({ id: it.id, is_active: true })}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="border-t border-border/60 pt-4 flex-col sm:flex-col sm:items-stretch gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add new item</div>
            <div className="flex gap-2">
              <Select value={newSection} onValueChange={setNewSection}>
                <SelectTrigger className="w-44 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                placeholder="Checklist item label..."
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="flex-1"
              />
              <Button onClick={handleAdd} disabled={!newLabel.trim() || addItem.isPending}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hide this checklist item?</AlertDialogTitle>
            <AlertDialogDescription>
              The item will be hidden from all clinic checklists. Existing completion history is preserved
              and you can restore the item later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) deactivateItem.mutate({ id: confirmDeleteId, is_active: false });
                setConfirmDeleteId(null);
              }}
            >
              Hide item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
