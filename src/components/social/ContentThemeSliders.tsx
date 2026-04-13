import { useState, useEffect } from "react";
import { useMonthlySignals } from "@/hooks/useMonthlySignals";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Save, RefreshCw, SlidersHorizontal, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

const HARD_GATES = [
  { key: "promotion_requested", label: "Promotions Allowed", description: "Allow promotional content in posts", offLabel: "BLOCKED", onLabel: "ACTIVE" },
  { key: "team_spotlight_requested", label: "Team Spotlights Allowed", description: "Allow individual team member features", offLabel: "BLOCKED", onLabel: "ACTIVE" },
  { key: "pricing_on_website", label: "Pricing on Website", description: "Website displays pricing information", offLabel: "NO", onLabel: "YES" },
  { key: "patient_consent", label: "Patient Consent Confirmed", description: "Written consent for patient content on file", offLabel: "NOT CONFIRMED", onLabel: "CONFIRMED", isBoolString: true, trueVal: "CONFIRMED", falseVal: "NOT_CONFIRMED" },
  { key: "end_of_life_content", label: "End-of-Life Content", description: "Allow euthanasia, pet loss, grief content", offLabel: "BLOCKED", onLabel: "REQUESTED", isBoolString: true, trueVal: "requested", falseVal: "not_requested" },
];

export default function ContentThemeSliders({ clinicId }: Props) {
  const { signals, upsertSignals } = useMonthlySignals(clinicId);
  const { role } = useUserRole();
  const [values, setValues] = useState<Record<string, number>>({});
  const [gateValues, setGateValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [savingGates, setSavingGates] = useState(false);
  const isStaff = role === "admin" || role === "concierge";

  useEffect(() => {
    const prefs = (signals?.client_content_preference || {}) as Record<string, number>;
    const initial: Record<string, number> = {};
    THEMES.forEach((t) => {
      initial[t.key] = prefs[t.key] ?? t.defaultVal;
    });
    setValues(initial);
  }, [signals]);

  // Load content_settings from clinic
  useEffect(() => {
    if (!clinicId) return;
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("clinics")
        .select("content_settings")
        .eq("id", clinicId)
        .maybeSingle();
      if (data?.content_settings) {
        setGateValues(data.content_settings as Record<string, any>);
      }
    };
    fetchSettings();
  }, [clinicId]);

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

  const handleGateToggle = (key: string, gate: typeof HARD_GATES[0]) => {
    const current = gateValues[key];
    let newVal: any;
    if (gate.isBoolString) {
      newVal = current === gate.trueVal ? gate.falseVal : gate.trueVal;
    } else {
      newVal = !current;
    }
    setGateValues((prev) => ({ ...prev, [key]: newVal }));
  };

  const handleSaveGates = async () => {
    if (!clinicId) return;
    setSavingGates(true);
    try {
      const { error } = await supabase
        .from("clinics")
        .update({ content_settings: gateValues } as any)
        .eq("id", clinicId);
      if (error) throw error;
      toast.success("Content safety gates updated");
    } catch (e: any) {
      toast.error("Failed to save gates", { description: e.message });
    } finally {
      setSavingGates(false);
    }
  };

  const isGateOn = (key: string, gate: typeof HARD_GATES[0]) => {
    const val = gateValues[key];
    if (gate.isBoolString) return val === gate.trueVal;
    return !!val;
  };

  return (
    <div className="space-y-6">
      {/* Theme Distribution Card */}
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

      {/* Hard Gates Card — Staff Only */}
      {isStaff && (
        <Card className="border-destructive/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Content Safety Hard Gates
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              These are strict content blocks. When OFF, the generation engine will produce zero content of that type. Staff-controlled.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {HARD_GATES.map((gate) => (
              <div key={gate.key} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">{gate.label}</Label>
                    <Badge
                      variant={isGateOn(gate.key, gate) ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {isGateOn(gate.key, gate) ? gate.onLabel : gate.offLabel}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{gate.description}</p>
                </div>
                <Switch
                  checked={isGateOn(gate.key, gate)}
                  onCheckedChange={() => handleGateToggle(gate.key, gate)}
                />
              </div>
            ))}

            {/* Pricing in Posts — only if pricing_on_website is true */}
            {gateValues.pricing_on_website && (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Include Pricing in Posts</Label>
                    <Badge
                      variant={gateValues.pricing_in_posts === "requested" ? "default" : "destructive"}
                      className="text-[10px]"
                    >
                      {gateValues.pricing_in_posts === "requested" ? "REQUESTED" : "NOT REQUESTED"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Both website pricing AND this toggle must be on for prices in posts</p>
                </div>
                <Switch
                  checked={gateValues.pricing_in_posts === "requested"}
                  onCheckedChange={() => {
                    setGateValues((prev) => ({
                      ...prev,
                      pricing_in_posts: prev.pricing_in_posts === "requested" ? "not_requested" : "requested",
                    }));
                  }}
                />
              </div>
            )}

            <Button onClick={handleSaveGates} disabled={savingGates} variant="outline" className="gap-2">
              {savingGates ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Gate Settings
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
