import { useState, useEffect } from "react";
import { useMonthlySignals } from "@/hooks/useMonthlySignals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clinicId: string | undefined;
}

const THEMES = [
  { key: "service_awareness", label: "Service Awareness", description: "Highlight specific services", defaultVal: 25, color: "bg-blue-500" },
  { key: "clinical_education", label: "Clinical Education", description: "Pet health tips & education", defaultVal: 30, color: "bg-emerald-500" },
  { key: "seasonal_safety", label: "Seasonal Safety", description: "Timely seasonal warnings", defaultVal: 20, color: "bg-amber-500" },
  { key: "community", label: "Community & Culture", description: "Local events, team stories", defaultVal: 15, color: "bg-violet-500" },
  { key: "promotions", label: "Promotions", description: "Special offers & deals", defaultVal: 10, color: "bg-rose-500" },
];

export default function ContentThemeSliders({ clinicId }: Props) {
  const { signals, upsertSignals } = useMonthlySignals(clinicId);
  const [values, setValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prefs = (signals?.client_content_preference || {}) as Record<string, number>;
    const initial: Record<string, number> = {};
    THEMES.forEach((t) => {
      initial[t.key] = prefs[t.key] ?? t.defaultVal;
    });
    setValues(initial);
  }, [signals]);

  const total = Object.values(values).reduce((s, v) => s + v, 0);
  const isBalanced = total === 100;

  const handleChange = (key: string, val: number) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleReset = () => {
    const reset: Record<string, number> = {};
    THEMES.forEach((t) => { reset[t.key] = t.defaultVal; });
    setValues(reset);
  };

  const handleSave = async () => {
    if (!isBalanced) {
      toast.error("Sliders must total 100%");
      return;
    }
    setSaving(true);
    try {
      await upsertSignals.mutateAsync({ client_content_preference: values } as any);
      toast.success("Content preferences saved");
    } catch (e: any) {
      toast.error("Failed to save", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Content Theme Distribution
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isBalanced ? "default" : "destructive"} className="text-xs">
              {total}% / 100%
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs">
              Reset
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Adjust how your monthly content is distributed across themes. Total must equal 100%.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {THEMES.map((theme) => (
          <div key={theme.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{theme.label}</p>
                <p className="text-xs text-muted-foreground">{theme.description}</p>
              </div>
              <span className="text-sm font-bold tabular-nums w-12 text-right">
                {values[theme.key] ?? theme.defaultVal}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full ${theme.color} shrink-0`} />
              <Slider
                value={[values[theme.key] ?? theme.defaultVal]}
                onValueChange={([v]) => handleChange(theme.key, v)}
                min={0}
                max={60}
                step={5}
                className="flex-1"
              />
            </div>
          </div>
        ))}

        {!isBalanced && (
          <p className="text-xs text-destructive flex items-center gap-1">
            ⚠ Sliders total {total}% — adjust to reach exactly 100%
          </p>
        )}

        <Button onClick={handleSave} disabled={!isBalanced || saving} className="gap-2">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  );
}
