import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MONTH_NAMES } from "@/lib/gbp/hookRotation";
import type { GBPTopicSet } from "@/lib/gbp/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: GBPTopicSet | null;
  onSave: (data: Partial<GBPTopicSet>) => void;
  isSaving: boolean;
}

export function TopicSetEditor({ open, onOpenChange, topic, onSave, isSaving }: Props) {
  const [form, setForm] = useState({
    seasonal_theme: "",
    week_1_topic: "",
    week_2_topic: "",
    week_3_topic: "",
    week_4_topic: "",
  });

  useEffect(() => {
    if (topic) {
      setForm({
        seasonal_theme: topic.seasonal_theme ?? "",
        week_1_topic: topic.week_1_topic ?? "",
        week_2_topic: topic.week_2_topic ?? "",
        week_3_topic: topic.week_3_topic ?? "",
        week_4_topic: topic.week_4_topic ?? "",
      });
    }
  }, [topic]);

  const handleSave = () => {
    if (!topic) return;
    onSave({
      ...(topic.id ? { id: topic.id } : {}),
      month: topic.month,
      variant: topic.variant,
      ...form,
    });
  };

  if (!topic) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Topic Set
            <Badge variant="outline" className="text-xs">{MONTH_NAMES[topic.month - 1]}</Badge>
            <Badge variant="secondary" className="text-xs font-mono">Variant {topic.variant}</Badge>
          </DialogTitle>
          <DialogDescription>
            Configure the 4-week topic assignments for this month/variant combination.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Seasonal Theme</Label>
            <Input
              value={form.seasonal_theme}
              onChange={e => setForm(f => ({ ...f, seasonal_theme: e.target.value }))}
              className="h-8 text-xs"
              placeholder="e.g. Spring Wellness"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Week 1 — What's New</Label>
            <Input
              value={form.week_1_topic}
              onChange={e => setForm(f => ({ ...f, week_1_topic: e.target.value }))}
              className="h-8 text-xs"
              placeholder="Topic for week 1"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">Week 2 — Products/Services Focus</Label>
            <Input
              value={form.week_2_topic}
              onChange={e => setForm(f => ({ ...f, week_2_topic: e.target.value }))}
              className="h-8 text-xs"
              placeholder="Service-focused topic for week 2"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Week 3 — What's New</Label>
            <Input
              value={form.week_3_topic}
              onChange={e => setForm(f => ({ ...f, week_3_topic: e.target.value }))}
              className="h-8 text-xs"
              placeholder="Topic for week 3"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Week 4 — What's New</Label>
            <Input
              value={form.week_4_topic}
              onChange={e => setForm(f => ({ ...f, week_4_topic: e.target.value }))}
              className="h-8 text-xs"
              placeholder="Topic for week 4"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Topic Set"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
