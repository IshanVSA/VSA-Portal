import { useState, useEffect } from "react";
import { useBrandDNA } from "@/hooks/useBrandDNA";
import { useMonthlySignals } from "@/hooks/useMonthlySignals";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield, Save, RefreshCw, CheckSquare, AlertTriangle,
  Building, Scale, Fingerprint, Target, Users, Camera,
  CalendarClock, Ban, BookOpen, TrendingUp, Edit2, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { computeBrandDNAScore } from "@/lib/brand-dna-score";

interface Props {
  clinicId: string | undefined;
}

// Team Review Checklist items - must all be checked before activation
const VEDANT_CHECKLIST = [
  { id: "voice_authentic", label: "Voice fingerprint sounds authentically like this clinic" },
  { id: "differentiator_validated", label: "Clinic differentiator is validated (review or manual)" },
  { id: "exclusions_confirmed", label: "Content exclusions confirmed with client" },
  { id: "governing_body_correct", label: "Governing body and jurisdiction are correct" },
  { id: "hospital_type_correct", label: "Hospital type classification is accurate" },
  { id: "stat_holiday_set", label: "Statutory holiday protocol is configured" },
  { id: "consent_confirmed", label: "Patient photo consent status confirmed" },
  { id: "locality_reviewed", label: "Locality data reviewed for accuracy" },
  { id: "narrative_anchor_approved", label: "Narrative anchor approved for content use" },
  { id: "score_above_50", label: "Completeness score is 50 or above" },
];

export default function AdminDNAProfileCard({ clinicId }: Props) {
  const { dna } = useBrandDNA(clinicId);
  const { role } = useUserRole();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [activating, setActivating] = useState(false);

  const isAdmin = role === "admin";
  const isConcierge = role === "concierge";
  const synthesized = (dna?.synthesized_profile || {}) as Record<string, any>;
  const score = synthesized.completeness_score || computeBrandDNAScore(dna as any);
  const isActive = dna?.status === "active";

  // Auto-activate the profile once completeness score reaches the threshold (>=50).
  // Runs once per clinic when synthesized DNA exists but status hasn't flipped to "active" yet.
  useEffect(() => {
    if (!clinicId || !dna) return;
    if (isActive) return;
    if (score < 50) return;
    if (!synthesized.voice_fingerprint) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase
        .from("clinic_brand_dna")
        .update({ status: "active" })
        .eq("clinic_id", clinicId);
      if (!cancelled && !error) {
        queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
      }
    })();
    return () => { cancelled = true; };
  }, [clinicId, dna?.id, isActive, score, synthesized.voice_fingerprint, queryClient]);

  // Editable fields state
  const [editFields, setEditFields] = useState({
    voice_fingerprint: synthesized.voice_fingerprint || [],
    narrative_anchor: synthesized.narrative_anchor || "",
    clinic_differentiator: synthesized.clinic_differentiator || "",
    target_client_profile: synthesized.target_client_profile || "",
    growth_priority: synthesized.growth_priority || "",
    content_exclusions: synthesized.content_exclusions || [],
    owner_presence: synthesized.owner_presence || "",
    patient_consent: synthesized.patient_consent || "",
    stat_holiday_protocol: synthesized.stat_holiday_protocol || "",
    governing_body: synthesized.governing_body || "",
    hospital_type: synthesized.hospital_type || "",
  });

  const canEdit = isAdmin || isConcierge; // staff can edit synthesized profile to correct AI mistakes

  const handleSave = async () => {
    if (!clinicId || !dna) return;
    setSaving(true);
    try {
      const updatedProfile = { ...synthesized, ...editFields };
      const { error } = await supabase
        .from("clinic_brand_dna")
        .update({ synthesized_profile: updatedProfile as any })
        .eq("clinic_id", clinicId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
      toast.success("Profile updated");
      setEditing(false);
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const allChecked = VEDANT_CHECKLIST.every((item) => {
    if (item.id === "score_above_50") return score >= 50;
    if (item.id === "differentiator_validated")
      return synthesized.differentiator_validated === true || checklist[item.id] === true;
    return checklist[item.id] === true;
  });

  const handleActivate = async () => {
    if (!clinicId || !allChecked) return;
    setActivating(true);
    try {
      const { error } = await supabase
        .from("clinic_brand_dna")
        .update({ status: "active" })
        .eq("clinic_id", clinicId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
      toast.success("Profile activated - content generation is now enabled");
    } catch (e: any) {
      toast.error("Activation failed", { description: e.message });
    } finally {
      setActivating(false);
    }
  };

  if (!dna || !synthesized.voice_fingerprint) return null;

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-600" />
            Admin DNA Profile Card
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isActive ? "default" : "secondary"}>
              {isActive ? "✓ ACTIVE" : dna.status?.toUpperCase()}
            </Badge>
            {canEdit && !editing && (
              <Button variant="outline" size="sm" onClick={() => {
                setEditFields({
                  voice_fingerprint: synthesized.voice_fingerprint || [],
                  narrative_anchor: synthesized.narrative_anchor || "",
                  clinic_differentiator: synthesized.clinic_differentiator || "",
                  target_client_profile: synthesized.target_client_profile || "",
                  growth_priority: synthesized.growth_priority || "",
                  content_exclusions: synthesized.content_exclusions || [],
                  owner_presence: synthesized.owner_presence || "",
                  patient_consent: synthesized.patient_consent || "",
                  stat_holiday_protocol: synthesized.stat_holiday_protocol || "",
                  governing_body: synthesized.governing_body || "",
                  hospital_type: synthesized.hospital_type || "",
                });
                setEditing(true);
              }} className="gap-1.5">
                <Edit2 className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Editable Fields */}
        <div className="grid gap-4 md:grid-cols-2">
          <FieldBlock
            label="Narrative Anchor"
            icon={<BookOpen className="h-3 w-3" />}
            editing={editing}
            value={editing ? editFields.narrative_anchor : synthesized.narrative_anchor}
            onChange={(v) => setEditFields((p) => ({ ...p, narrative_anchor: v }))}
            multiline
          />
          <FieldBlock
            label="Clinic Differentiator"
            icon={<Target className="h-3 w-3" />}
            editing={editing}
            value={editing ? editFields.clinic_differentiator : synthesized.clinic_differentiator}
            onChange={(v) => setEditFields((p) => ({ ...p, clinic_differentiator: v }))}
            multiline
          />
          <FieldBlock
            label="Target Client"
            icon={<Users className="h-3 w-3" />}
            editing={editing}
            value={editing ? editFields.target_client_profile : synthesized.target_client_profile}
            onChange={(v) => setEditFields((p) => ({ ...p, target_client_profile: v }))}
          />
          <FieldBlock
            label="Growth Priority"
            icon={<TrendingUp className="h-3 w-3" />}
            editing={editing}
            value={editing ? editFields.growth_priority : synthesized.growth_priority}
            onChange={(v) => setEditFields((p) => ({ ...p, growth_priority: v }))}
          />
        </div>

        {/* AUTO fields - read-only for concierge */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Scale className="h-3 w-3" /> Governing Body
              {isConcierge && <Lock className="h-3 w-3 text-muted-foreground/50 ml-1" />}
            </p>
            {editing && canEdit ? (
              <Input
                value={editFields.governing_body}
                onChange={(e) => setEditFields((p) => ({ ...p, governing_body: e.target.value }))}
                className="text-sm"
              />
            ) : (
              <p className="text-sm">{synthesized.governing_body || "—"}</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Building className="h-3 w-3" /> Hospital Type
              {isConcierge && <Lock className="h-3 w-3 text-muted-foreground/50 ml-1" />}
            </p>
            {editing && canEdit ? (
              <Select value={editFields.hospital_type} onValueChange={(v) => setEditFields((p) => ({ ...p, hospital_type: v }))}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TYPE_1">TYPE 1 - 24/7 Emergency</SelectItem>
                  <SelectItem value="TYPE_2">TYPE 2 - Extended Hours</SelectItem>
                  <SelectItem value="TYPE_3">TYPE 3 - General Practice</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary">{synthesized.hospital_type?.replace("_", " ") || "—"}</Badge>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Camera className="h-3 w-3" /> Patient Consent
            </p>
            {editing && canEdit ? (
              <Select value={editFields.patient_consent} onValueChange={(v) => setEditFields((p) => ({ ...p, patient_consent: v }))}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">YES</SelectItem>
                  <SelectItem value="CONDITIONAL">CONDITIONAL</SelectItem>
                  <SelectItem value="NO">NO</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={synthesized.patient_consent === "YES" ? "default" : "secondary"}>
                {synthesized.patient_consent || "—"}
              </Badge>
            )}
          </div>
        </div>

        {/* Voice Fingerprint */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Fingerprint className="h-3 w-3" /> Voice Fingerprint
          </p>
          {editing ? (
            <Textarea
              value={editFields.voice_fingerprint.join("\n")}
              onChange={(e) => setEditFields((p) => ({ ...p, voice_fingerprint: e.target.value.split("\n").filter(Boolean) }))}
              rows={4}
              placeholder="One phrase per line"
              className="text-sm"
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(synthesized.voice_fingerprint || []).map((p: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs italic">"{p}"</Badge>
              ))}
            </div>
          )}
        </div>

        {/* Content Exclusions */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Ban className="h-3 w-3" /> Content Exclusions
          </p>
          {editing ? (
            <Textarea
              value={(editFields.content_exclusions || []).join("\n")}
              onChange={(e) => setEditFields((p) => ({ ...p, content_exclusions: e.target.value.split("\n").filter(Boolean) }))}
              rows={3}
              placeholder="One exclusion per line"
              className="text-sm"
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(synthesized.content_exclusions || []).map((ex: string, i: number) => (
                <Badge key={i} variant="destructive" className="text-xs">{ex}</Badge>
              ))}
              {(!synthesized.content_exclusions || synthesized.content_exclusions.length === 0) && (
                <span className="text-sm text-muted-foreground">None</span>
              )}
            </div>
          )}
        </div>

        {/* Save buttons */}
        {editing && (
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        )}

        {/* ─── Team Review Checklist ─── */}
        {isAdmin && !isActive && (
          <div className="space-y-3 pt-4 border-t border-border/50">
            <p className="text-sm font-semibold flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-emerald-600" />
              Team Review Checklist
            </p>
            <p className="text-xs text-muted-foreground">
              All items must be verified before activating this profile for content generation.
            </p>
            <div className="space-y-2">
              {VEDANT_CHECKLIST.map((item) => {
                const autoCheck =
                  item.id === "score_above_50"
                    ? score >= 50
                    : item.id === "differentiator_validated"
                      ? synthesized.differentiator_validated === true
                      : false;
                const isChecked = autoCheck || checklist[item.id] === true;
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <Checkbox
                      id={item.id}
                      checked={isChecked}
                      disabled={autoCheck}
                      onCheckedChange={(checked) =>
                        setChecklist((p) => ({ ...p, [item.id]: checked === true }))
                      }
                    />
                    <label
                      htmlFor={item.id}
                      className={`text-sm cursor-pointer ${isChecked ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {item.label}
                      {autoCheck && <Badge variant="outline" className="ml-2 text-[10px]">AUTO</Badge>}
                    </label>
                  </div>
                );
              })}
            </div>
            <Button
              onClick={handleActivate}
              disabled={!allChecked || activating}
              className="gap-2 mt-2"
            >
              {activating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Activate Profile
            </Button>
            {!allChecked && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Complete all checklist items to activate
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FieldBlock({
  label, icon, editing, value, onChange, multiline,
}: {
  label: string; icon: React.ReactNode; editing: boolean;
  value: string; onChange: (v: string) => void; multiline?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">{icon} {label}</p>
      {editing ? (
        multiline ? (
          <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="text-sm" />
        ) : (
          <Input value={value} onChange={(e) => onChange(e.target.value)} className="text-sm" />
        )
      ) : (
        <p className="text-sm">{value || <span className="italic text-muted-foreground">—</span>}</p>
      )}
    </div>
  );
}
