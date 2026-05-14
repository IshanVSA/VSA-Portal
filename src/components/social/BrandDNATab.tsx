import { useState, useEffect } from "react";
import { useBrandDNA } from "@/hooks/useBrandDNA";
import { computeBrandDNAScore } from "@/lib/brand-dna-score";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dna, CheckCircle, AlertCircle, Clock, Globe, RefreshCw, User,
  Stethoscope, Building, Star, MessageSquareQuote, Fingerprint,
  TrendingUp, Sparkles, Shield, Scale, BookOpen, Target, Ban,
  Users, Camera, CalendarClock, CheckSquare, AlertTriangle,
  MapPin, TreePine, Home, Car, Edit2, Save, X,
} from "lucide-react";
import { format } from "date-fns";
import { lazy, Suspense } from "react";

const AdminDNAProfileCard = lazy(() => import("@/components/social/AdminDNAProfileCard"));
import DNAJsonEditDialog from "@/components/social/DNAJsonEditDialog";

const QUESTION_LABELS: Record<string, string> = {
  q1_differentiator: "Real Differentiator",
  q2_myth: "Myth / Misconception",
  q3_target_client: "Target Client",
  q4_founding_story: "Founding Story",
  q5_owner_presence: "Owner Presence",
  q6_growth_priority: "Growth Priority",
  q7_content_exclusions: "Content Exclusions",
  q8_community_connections: "Community Connections",
  q9_patient_consent: "Patient Photo Consent",
  q10_stat_holidays: "Statutory Holidays",
};

const ADDITIONAL_LABELS: Record<string, string> = {
  neighbourhood_character: "Neighbourhood Character",
  voice_phrases: "Voice Phrases",
  local_trails_parks: "Local Trails / Parks",
  cultural_communities: "Cultural Communities",
  visual_style: "Visual Style",
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 90 ? "default" : score >= 70 ? "secondary" : "destructive";
  return <Badge variant={color}>{score}% complete</Badge>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed" || status === "synthesized")
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === "draft") return <Clock className="h-4 w-4 text-yellow-500" />;
  return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
}

interface Props {
  clinicId: string | undefined;
}

export default function BrandDNATab({ clinicId }: Props) {
  const { role } = useUserRole();
  const isClient = role === "client";
  const { dna, isLoading, extractWebsite, mineReviews, synthesizeDNA, localityFetch, upsertDNA } = useBrandDNA(clinicId);
  const [editingAnswers, setEditingAnswers] = useState(false);
  const [draftCallNotes, setDraftCallNotes] = useState<Record<string, string>>({});
  const [draftAdditional, setDraftAdditional] = useState<Record<string, string>>({});

  // Sync drafts when DNA loads / changes
  useEffect(() => {
    if (dna) {
      setDraftCallNotes((dna.call_notes as Record<string, string>) || {});
      const af = (dna.additional_fields as Record<string, any>) || {};
      const stringFields: Record<string, string> = {};
      Object.keys(ADDITIONAL_LABELS).forEach((k) => {
        if (typeof af[k] === "string") stringFields[k] = af[k];
        else stringFields[k] = "";
      });
      setDraftAdditional(stringFields);
    }
  }, [dna?.id]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const callNotes = (dna?.call_notes || {}) as Record<string, string>;
  const additionalFields = (dna?.additional_fields || {}) as Record<string, any>;
  const answeredCount = Object.values(callNotes).filter((v) => v && typeof v === "string" && v.trim()).length;
  const websiteExtraction = additionalFields.website_extraction as Record<string, any> | undefined;
  const reviewMining = additionalFields.review_mining as Record<string, any> | undefined;
  const localityData = additionalFields.locality as Record<string, any> | undefined;
  const synthesizedProfile = (dna?.synthesized_profile || {}) as Record<string, any>;
  const hasSynthesis = synthesizedProfile && Object.keys(synthesizedProfile).length > 0 && synthesizedProfile.voice_fingerprint;

  const handleSaveAnswers = async () => {
    if (!dna) return;
    try {
      // Strip empty additional fields so we don't bloat the JSON
      const cleanedAdditional: Record<string, string> = {};
      Object.entries(draftAdditional).forEach(([k, v]) => {
        if (v && v.trim()) cleanedAdditional[k] = v.trim();
      });
      await upsertDNA.mutateAsync({
        call_notes: draftCallNotes,
        additional_fields: cleanedAdditional,
        status: dna.status === "active" ? "active" : "completed",
      });
      setEditingAnswers(false);
    } catch (e) {
      // toast handled by mutation
    }
  };

  // Active layer state (left-rail navigator)
  type LayerKey = "synthesis" | "website" | "reviews" | "owner_call" | "locality" | "tasks";
  const [activeLayer, setActiveLayer] = useState<LayerKey>("synthesis");

  const improvableTasks =
    (synthesizedProfile.field_scores || []).filter(
      (f: any) => f.status !== "captured" && f.weight > 0
    ).length;

  const inProgressMeta = (label: string) => (
    <span className="flex items-center gap-1 text-primary">
      <RefreshCw className="h-3 w-3 animate-spin" />
      {label}
    </span>
  );

  const layers: Array<{ key: LayerKey; label: string; meta: React.ReactNode; metaTone?: "ok" | "warn" | "muted" | "critical" | "active"; busy?: boolean }> = [
    {
      key: "synthesis",
      label: "Synthesis",
      meta: synthesizeDNA.isPending ? inProgressMeta("synthesizing") : hasSynthesis ? "synthesized" : "pending",
      metaTone: synthesizeDNA.isPending ? "active" : hasSynthesis ? "ok" : "muted",
      busy: synthesizeDNA.isPending,
    },
    {
      key: "website",
      label: "Website",
      meta: extractWebsite.isPending ? inProgressMeta("extracting") : websiteExtraction ? "verified" : "pending",
      metaTone: extractWebsite.isPending ? "active" : websiteExtraction ? "ok" : "muted",
      busy: extractWebsite.isPending,
    },
    {
      key: "reviews",
      label: "Reviews",
      meta: mineReviews.isPending
        ? inProgressMeta("mining")
        : reviewMining
          ? `${reviewMining.review_count ?? 0} / ${reviewMining.total_reviews_on_google ?? reviewMining.review_count ?? 0}`
          : "pending",
      metaTone: mineReviews.isPending ? "active" : reviewMining ? "ok" : "muted",
      busy: mineReviews.isPending,
    },
    {
      key: "owner_call",
      label: "Owner call",
      meta: upsertDNA.isPending ? inProgressMeta("saving") : `${answeredCount} / 10`,
      metaTone: upsertDNA.isPending ? "active" : answeredCount >= 10 ? "ok" : answeredCount > 0 ? "warn" : "muted",
      busy: upsertDNA.isPending,
    },
    {
      key: "locality",
      label: "Locality",
      meta: localityFetch.isPending ? inProgressMeta("fetching") : localityData ? "verified" : "pending",
      metaTone: localityFetch.isPending ? "active" : localityData ? "ok" : "muted",
      busy: localityFetch.isPending,
    },
    {
      key: "tasks",
      label: "Tasks",
      meta: improvableTasks > 0 ? `${improvableTasks} open` : "clear",
      metaTone: improvableTasks > 0 ? "critical" : "ok",
    },
  ];

  const toneClass = (tone?: "ok" | "warn" | "muted" | "critical" | "active") =>
    tone === "active"
      ? "text-primary"
      : tone === "ok"
        ? "text-emerald-500"
        : tone === "warn"
          ? "text-amber-500"
          : tone === "critical"
            ? "text-destructive"
            : "text-muted-foreground";

  // Per-layer header action
  const layerAction = () => {
    if (isClient) return null;
    if (activeLayer === "synthesis") {
      return (
        <Button size="sm" onClick={() => synthesizeDNA.mutate()} disabled={synthesizeDNA.isPending || !dna} className="gap-2">
          {synthesizeDNA.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {synthesizeDNA.isPending ? "Synthesizing..." : hasSynthesis ? "Re-synthesize" : "Synthesize DNA"}
        </Button>
      );
    }
    if (activeLayer === "website") {
      return (
        <Button variant="outline" size="sm" onClick={() => extractWebsite.mutate()} disabled={extractWebsite.isPending} className="gap-2">
          {extractWebsite.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
          {extractWebsite.isPending ? "Extracting..." : websiteExtraction ? "Re-extract" : "Extract Website"}
        </Button>
      );
    }
    if (activeLayer === "reviews") {
      return (
        <Button variant="outline" size="sm" onClick={() => mineReviews.mutate()} disabled={mineReviews.isPending} className="gap-2">
          {mineReviews.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
          {mineReviews.isPending ? "Mining..." : reviewMining ? "Re-mine" : "Mine Reviews"}
        </Button>
      );
    }
    if (activeLayer === "locality") {
      return (
        <Button variant="outline" size="sm" onClick={() => localityFetch.mutate()} disabled={localityFetch.isPending} className="gap-2">
          {localityFetch.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {localityFetch.isPending ? "Fetching..." : localityData ? "Re-fetch" : "Fetch Locality"}
        </Button>
      );
    }
    if (activeLayer === "owner_call" && dna) {
      return !editingAnswers ? (
        <Button variant="outline" size="sm" onClick={() => setEditingAnswers(true)} className="gap-1.5">
          <Edit2 className="h-3.5 w-3.5" /> Edit Answers
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDraftCallNotes((dna.call_notes as Record<string, string>) || {});
              const af = (dna.additional_fields as Record<string, any>) || {};
              const stringFields: Record<string, string> = {};
              Object.keys(ADDITIONAL_LABELS).forEach((k) => {
                stringFields[k] = typeof af[k] === "string" ? af[k] : "";
              });
              setDraftAdditional(stringFields);
              setEditingAnswers(false);
            }}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSaveAnswers} disabled={upsertDNA.isPending} className="gap-1.5">
            {upsertDNA.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      );
    }
    return null;
  };

  const layerTitle: Record<LayerKey, string> = {
    synthesis: "Synthesis · The Brand DNA",
    website: "Layer 1 · Website Extraction",
    reviews: "Layer 2 · Review Mining",
    owner_call: "Layer 3 · Collection Call Answers",
    locality: "Locality Intelligence",
    tasks: "Tasks · Improve Score",
  };

  const emptyState = (icon: React.ReactNode, title: string, hint: string) => (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-3 text-muted-foreground">{icon}</div>
        <p className="text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
            <Dna className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">Brand DNA Profile</h2>
            {dna && (
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <StatusIcon status={dna.status} />
                <span className="text-xs text-muted-foreground capitalize">{dna.status}</span>
                <ScoreBadge score={computeBrandDNAScore(dna as any)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile layer selector */}
      <div className="md:hidden">
        <select
          value={activeLayer}
          onChange={(e) => setActiveLayer(e.target.value as LayerKey)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {layers.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Two-pane navigator */}
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Left rail (desktop/tablet only) */}
        <Card className="hidden md:block h-fit md:sticky md:top-4">
          <CardContent className="p-2">
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground px-3 pt-2 pb-1">LAYERS</p>
            <nav className="flex flex-col gap-1">
              {layers.map((l) => {
                const active = activeLayer === l.key;
                return (
                  <button
                    key={l.key}
                    onClick={() => setActiveLayer(l.key)}
                    className={`group flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left whitespace-nowrap ${
                      active
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          active ? "bg-primary" : "bg-muted-foreground/40"
                        }`}
                      />
                      {l.label}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wide ${toneClass(l.metaTone)}`}>
                      {l.meta}
                    </span>
                  </button>
                );
              })}
            </nav>
          </CardContent>
        </Card>

        {/* Right detail */}
        <div className="space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              {layerTitle[activeLayer]}
            </h3>
            <div className="shrink-0">{layerAction()}</div>
          </div>

          {activeLayer === "synthesis" && (
            <>
              {hasSynthesis ? (
                <>
                  <SynthesizedProfileCard profile={synthesizedProfile} clinicId={clinicId} canEdit={true} />
                  <Suspense fallback={<Skeleton className="h-48 w-full" />}>
                    <AdminDNAProfileCard clinicId={clinicId} />
                  </Suspense>
                </>
              ) : (
                emptyState(
                  <Sparkles className="h-10 w-10 mx-auto" />,
                  "DNA hasn't been synthesized yet.",
                  "Capture the Website, Reviews, Owner call, and Locality layers, then click Synthesize DNA."
                )
              )}
            </>
          )}

          {activeLayer === "website" && (
            websiteExtraction
              ? <WebsiteExtractionCard data={websiteExtraction} clinicId={clinicId} canEdit={true} />
              : emptyState(<Globe className="h-10 w-10 mx-auto" />, "No website extraction yet.", "Click Extract Website to pull hospital details from the live site.")
          )}

          {activeLayer === "reviews" && (
            reviewMining
              ? <ReviewMiningCard data={reviewMining} clinicId={clinicId} canEdit={true} />
              : emptyState(<Star className="h-10 w-10 mx-auto" />, "No review mining yet.", "Click Mine Reviews to analyse Google reviews for themes and voice signals.")
          )}

          {activeLayer === "locality" && (
            localityData
              ? <LocalityCard data={localityData} clinicId={clinicId} canEdit={true} />
              : emptyState(<MapPin className="h-10 w-10 mx-auto" />, "No locality data yet.", "Click Fetch Locality to populate neighbourhood, trails, and cultural signals.")
          )}

          {activeLayer === "owner_call" && (
            dna ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {Object.entries(QUESTION_LABELS).map(([key, label]) => (
                    <Card key={key} className="border-border/60">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {editingAnswers ? (
                          <Textarea
                            value={draftCallNotes[key] || ""}
                            onChange={(e) => setDraftCallNotes((p) => ({ ...p, [key]: e.target.value }))}
                            rows={3}
                            className="text-sm"
                            placeholder="Enter answer…"
                          />
                        ) : (
                          <p className="text-sm text-foreground whitespace-pre-wrap">
                            {callNotes[key] || <span className="italic text-muted-foreground">Not answered</span>}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {(editingAnswers ||
                  Object.entries(ADDITIONAL_LABELS).some(([key]) => {
                    const val = additionalFields[key];
                    return val && typeof val === "string" && val.trim();
                  })) && (
                  <>
                    <h4 className="text-sm font-semibold text-muted-foreground mt-4">Additional Details</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(ADDITIONAL_LABELS).map(([key, label]) => {
                        const val = additionalFields[key];
                        if (!editingAnswers && (!val || typeof val !== "string" || !val.trim())) return null;
                        return (
                          <Card key={key} className="border-border/60">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                            </CardHeader>
                            <CardContent>
                              {editingAnswers ? (
                                <Input
                                  value={draftAdditional[key] || ""}
                                  onChange={(e) => setDraftAdditional((p) => ({ ...p, [key]: e.target.value }))}
                                  className="text-sm"
                                  placeholder="Optional…"
                                />
                              ) : (
                                <p className="text-sm text-foreground">{val}</p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : emptyState(<Dna className="h-10 w-10 mx-auto" />, "No collection call submitted yet.", "Waiting for the client to complete the Brand DNA questionnaire.")
          )}

          {activeLayer === "tasks" && (
            hasSynthesis
              ? <ImproveScoreChecklist profile={synthesizedProfile} />
              : emptyState(<CheckSquare className="h-10 w-10 mx-auto" />, "No tasks yet.", "Synthesize the DNA first to see field-level improvement actions.")
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Improve Score Checklist ── */
function ImproveScoreChecklist({ profile }: { profile: Record<string, any> }) {
  const fieldScores: any[] = profile.field_scores || [];
  if (fieldScores.length === 0) return null;

  // Find fields that aren't fully captured, sorted by weight (biggest impact first)
  const improvable = fieldScores
    .filter((f: any) => f.status !== "captured" && f.weight > 0)
    .sort((a: any, b: any) => (b.weight - b.weighted_score) - (a.weight - a.weighted_score))
    .slice(0, 5);

  if (improvable.length === 0) return null;

  const actionMap: Record<string, string> = {
    voice_fingerprint: "Schedule a deeper collection call - ask the owner for specific phrases they repeat to clients",
    narrative_anchor: "Ask the owner to tell the founding story in their own words during the collection call",
    clinic_differentiator: "Run Review Mining to cross-validate the owner's stated differentiator",
    target_client: "Ask Q3 again with specifics: age, pet type, neighbourhood, income level",
    growth_priority: "Ask the owner which single service they want to grow most this quarter",
    content_exclusions: "Confirm content no-go topics during collection call (Q7)",
    community_connections: "Ask about local shelters, rescues, pet stores, dog parks they partner with",
    owner_presence: "Confirm owner presence level for social media (Q5)",
    patient_consent: "Get explicit patient photo consent status from the clinic (Q9)",
    stat_holiday: "Confirm statutory holiday hours protocol (Q10)",
    google_review_themes: "Run Review Mining to extract real client sentiment themes",
    doctors_voice_topic: "Ask the doctor: 'What myth do you bust every week?' (Q2)",
    founding_story: "Get a richer founding story - when, why, personal motivation (Q4)",
    founding_year: "Check website About page or ask during collection call",
    neighbourhood: "Run Locality Fetch to auto-populate neighbourhood data",
    cultural_communities: "Run Locality Fetch to detect nearby cultural communities",
    local_trails: "Run Locality Fetch to find nearby trails, parks, and wildlife areas",
    hospital_name: "Verify the official hospital name matches the website",
    services: "Extract the full service list from the website",
    hours: "Confirm operating hours from the website or call",
    about_us: "Extract or write the About Us section",
    brand_identity: "Define visual brand identity (colors, tone, style)",
    booking_url: "Add the online booking URL to the clinic profile",
    phone: "Confirm the main phone number",
    doctors: "List all veterinarians with their specialties",
    hospital_type: "Classify as TYPE_1 (24/7), TYPE_2 (emergency hours), or TYPE_3 (general)",
    governing_body: "Verify provincial/state governing body",
  };

  return (
    <div className="rounded-lg border border-amber-300/40 bg-amber-50/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-amber-600" />
        <p className="text-sm font-semibold text-amber-800">Improve Your Score - Top Actions</p>
        <Badge variant="outline" className="text-[10px] ml-auto border-amber-300 text-amber-700">
          +{improvable.reduce((sum: number, f: any) => sum + (f.weight - f.weighted_score), 0)} pts possible
        </Badge>
      </div>
      <div className="space-y-2">
        {improvable.map((f: any, i: number) => {
          const gap = f.weight - f.weighted_score;
          const action = actionMap[f.field] || `Provide missing data for "${f.field}"`;
          return (
            <div key={i} className="flex items-start gap-3 text-sm">
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                <span className="text-xs font-mono font-bold text-amber-700">+{gap}</span>
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <div>
                <span className="font-medium text-foreground">{f.field.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground"> - {action}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Synthesized Profile Card ── */
function SynthesizedProfileCard({ profile, clinicId, canEdit }: { profile: Record<string, any>; clinicId: string | undefined; canEdit?: boolean }) {
  const score = profile.completeness_score || 0;
  const scoreColor = score >= 90 ? "text-green-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  const scoreLabel = score >= 90 ? "Full Generation Ready" : score >= 70 ? "Generate with Warnings" : score >= 50 ? "Limited Generation" : "Do Not Activate";
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card className="border-violet-500/20 bg-violet-500/5">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
            <span className="truncate">Synthesized DNA Profile</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-right">
              <span className={`text-lg font-bold ${scoreColor}`}>{Math.round(score)}%</span>
              <p className="text-xs text-muted-foreground">{scoreLabel}</p>
            </div>
            {profile.synthesized_at && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {format(new Date(profile.synthesized_at), "MMM d, yyyy h:mm a")}
              </span>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5 h-7 px-2">
                <Edit2 className="h-3 w-3" /> Edit
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Improve Score Checklist */}
        {score < 95 && <ImproveScoreChecklist profile={profile} />}
        {/* Voice Fingerprint */}
        {profile.voice_fingerprint?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Fingerprint className="h-3 w-3" /> Voice Fingerprint ({profile.voice_fingerprint.length} phrases)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profile.voice_fingerprint.map((phrase: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs font-normal italic border-violet-300">"{phrase}"</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Narrative Anchor */}
        {profile.narrative_anchor && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> Narrative Anchor
            </p>
            <p className="text-sm italic text-foreground bg-violet-500/5 rounded-lg p-3 border border-violet-200/30">
              "{profile.narrative_anchor}"
            </p>
          </div>
        )}

        {/* Differentiator */}
        {profile.clinic_differentiator && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" /> Clinic Differentiator
              <DifferentiatorValidationBadge clinicId={clinicId} profile={profile} />
            </p>
            <p className="text-sm">{profile.clinic_differentiator}</p>
            {profile.differentiator_validation_note && (
              <p className="text-xs text-muted-foreground italic mt-1">
                Note: {profile.differentiator_validation_note}
              </p>
            )}
          </div>
        )}

        {/* Grid: Governing Body, Hospital Type, Stat Holiday */}
        <div className="grid gap-4 md:grid-cols-3">
          {profile.governing_body && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Scale className="h-3 w-3" /> Governing Body</p>
              <p className="text-sm">{profile.governing_body}</p>
              {profile.jurisdiction && <p className="text-xs text-muted-foreground">{profile.jurisdiction}</p>}
            </div>
          )}
          {profile.hospital_type && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Building className="h-3 w-3" /> Hospital Type</p>
              <Badge variant="secondary">{profile.hospital_type.replace("_", " ")}</Badge>
              {profile.hospital_type_reasoning && <p className="text-xs text-muted-foreground">{profile.hospital_type_reasoning}</p>}
            </div>
          )}
          {profile.stat_holiday_protocol && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Stat Holiday Protocol</p>
              <Badge variant="outline">{profile.stat_holiday_protocol.replace(/_/g, " ")}</Badge>
            </div>
          )}
        </div>

        {/* Grid: Owner, Target, Growth, Consent */}
        <div className="grid gap-4 md:grid-cols-2">
          {profile.founding_story && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Founding Story</p>
              <p className="text-sm">{profile.founding_story}</p>
            </div>
          )}
          {profile.doctors_voice_topic && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Doctor's Voice Topic</p>
              <p className="text-sm">{profile.doctors_voice_topic}</p>
            </div>
          )}
          {profile.target_client_profile && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Target Client</p>
              <p className="text-sm">{profile.target_client_profile}</p>
            </div>
          )}
          {profile.growth_priority && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Growth Priority</p>
              <p className="text-sm">{profile.growth_priority}</p>
            </div>
          )}
        </div>

        {/* Owner Presence + Consent */}
        <div className="grid gap-4 md:grid-cols-3">
          {profile.owner_presence && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Owner Presence</p>
              <Badge variant="outline">{profile.owner_presence}</Badge>
            </div>
          )}
          {profile.patient_consent && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Camera className="h-3 w-3" /> Patient Consent</p>
              <Badge variant={profile.patient_consent === "YES" ? "default" : profile.patient_consent === "CONDITIONAL" ? "secondary" : "destructive"}>
                {profile.patient_consent}
              </Badge>
            </div>
          )}
        </div>

        {/* Content Exclusions */}
        {profile.content_exclusions?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Ban className="h-3 w-3" /> Content Exclusions</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.content_exclusions.map((ex: string, i: number) => (
                <Badge key={i} variant="destructive" className="text-xs font-normal">{ex}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Community Connections */}
        {profile.community_connections?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Community Connections</p>
            <div className="flex flex-wrap gap-2">
              {profile.community_connections.map((c: any, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{c.name}{c.relationship ? ` - ${c.relationship}` : ""}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Review Themes */}
        {profile.google_review_themes?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" /> Review Themes</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.google_review_themes.map((t: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Confidence Flags */}
        {profile.confidence_flags?.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-border/50">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Confidence Flags ({profile.confidence_flags.length})
            </p>
            <div className="space-y-2">
              {profile.confidence_flags.map((flag: any, i: number) => (
                <div key={i} className="rounded-lg border border-amber-200/50 bg-amber-50/30 p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={flag.severity === "high" ? "destructive" : flag.severity === "medium" ? "secondary" : "outline"} className="text-[10px]">
                      {flag.severity || "medium"}
                    </Badge>
                    <span className="font-medium text-xs">{flag.field}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{flag.issue}</p>
                  <p className="text-xs text-muted-foreground mt-1">→ {flag.resolution}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Review Checklist */}
        {profile.vedant_review_checklist?.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-border/50">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <CheckSquare className="h-3 w-3 text-violet-500" /> Team Review Checklist
            </p>
            <div className="space-y-1.5">
              {profile.vedant_review_checklist.map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Badge variant={item.priority === "critical" ? "destructive" : item.priority === "high" ? "secondary" : "outline"} className="text-[10px] mt-0.5 shrink-0">
                    {item.priority}
                  </Badge>
                  <span className="text-xs">{item.item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Field Scores (collapsible summary) */}
        {profile.field_scores?.length > 0 && (
          <details className="pt-3 border-t border-border/50">
            <summary className="text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground">
              Field-by-Field Scoring ({profile.field_scores.filter((f: any) => f.status === "captured").length}/{profile.field_scores.length} captured)
            </summary>
            <div className="mt-2 grid gap-1">
              {profile.field_scores.map((f: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                  <span className="text-muted-foreground">{f.field}</span>
                  <div className="flex items-center gap-2">
                    {f.source && <span className="text-[10px] text-muted-foreground/60">{f.source}</span>}
                    <Badge
                      variant={f.status === "captured" ? "default" : f.status === "partially_captured" ? "secondary" : "destructive"}
                      className="text-[10px]"
                    >
                      {f.status.replace("_", " ")} ({f.weighted_score}/{f.weight})
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
      <DNAJsonEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clinicId={clinicId}
        title="Synthesized DNA Profile"
        description="Edit any field in the synthesized profile. Changes merge into the existing profile and are reflected immediately across content generation."
        value={profile}
        target={{ kind: "synthesized_profile" }}
      />
    </Card>
  );
}
/* ── Layer 1 Card ── */
function WebsiteExtractionCard({ data, clinicId, canEdit }: { data: Record<string, any> | undefined; clinicId?: string; canEdit?: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  if (!data) return null;
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Layer 1 - Website Extraction
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.confidence && (
              <Badge variant={data.confidence === "high" ? "default" : data.confidence === "medium" ? "secondary" : "destructive"}>
                {data.confidence} confidence
              </Badge>
            )}
            {data.extracted_at && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(data.extracted_at), "MMM d, yyyy h:mm a")}
              </span>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5 h-7 px-2">
                <Edit2 className="h-3 w-3" /> Edit
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.hospital_name && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Building className="h-3 w-3" /> Hospital Name</p>
              <p className="text-sm">{data.hospital_name}</p>
            </div>
          )}
          {data.phone && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Phone</p>
              <p className="text-sm">{data.phone}</p>
            </div>
          )}
          {data.hours && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Hours</p>
              <p className="text-sm">{data.hours}</p>
            </div>
          )}
          {data.founding_year && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Founded</p>
              <p className="text-sm">{data.founding_year}</p>
            </div>
          )}
          {data.booking_url && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Booking URL</p>
              <a href={data.booking_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline truncate block">{data.booking_url}</a>
            </div>
          )}
        </div>
        {data.doctors?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Doctors & Staff ({data.doctors.length})</p>
            <div className="flex flex-wrap gap-2">
              {data.doctors.map((doc: any, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{doc.name}{doc.credentials ? `, ${doc.credentials}` : ""}{doc.role ? ` (${doc.role})` : ""}</Badge>
              ))}
            </div>
          </div>
        )}
        {data.services_list?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Services ({data.services_list.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {data.services_list.map((svc: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">{svc}</Badge>
              ))}
            </div>
          </div>
        )}
        {data.about_us_content && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">About Us</p>
            <p className="text-sm text-muted-foreground">{data.about_us_content}</p>
          </div>
        )}
        {data.brand_identity && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Brand Identity</p>
            <div className="grid gap-2 md:grid-cols-3">
              {data.brand_identity.tagline && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Tagline</p>
                  <p className="text-sm italic">"{data.brand_identity.tagline}"</p>
                </div>
              )}
              {data.brand_identity.tone && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Tone</p>
                  <p className="text-sm capitalize">{data.brand_identity.tone}</p>
                </div>
              )}
              {data.brand_identity.values?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Values</p>
                  <div className="flex flex-wrap gap-1">
                    {data.brand_identity.values.map((v: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">{v}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {data.source_urls?.length > 0 && (
          <div className="space-y-1 pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">Scraped {data.source_urls.length} page(s)</p>
          </div>
        )}
      </CardContent>
      <DNAJsonEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clinicId={clinicId}
        title="Layer 1 — Website Extraction"
        value={data}
        target={{ kind: "additional_field", key: "website_extraction" }}
      />
    </Card>
  );
}

/* ── Layer 2 Card ── */
function ReviewMiningCard({ data, clinicId, canEdit }: { data: Record<string, any> | undefined; clinicId?: string; canEdit?: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  if (!data) return null;
  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Layer 2 - Review Mining
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.confidence && (
              <Badge variant={data.confidence === "high" ? "default" : data.confidence === "medium" ? "secondary" : "destructive"}>
                {data.confidence} confidence
              </Badge>
            )}
            {data.avg_rating && (
              <Badge variant="outline" className="gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {data.avg_rating}
              </Badge>
            )}
            {data.mined_at && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(data.mined_at), "MMM d, yyyy h:mm a")}
              </span>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5 h-7 px-2">
                <Edit2 className="h-3 w-3" /> Edit
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Analyzed {data.review_count || 0} of {data.total_reviews_on_google || 0} total reviews
          {data.place_name ? ` for "${data.place_name}"` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.top_themes?.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MessageSquareQuote className="h-3 w-3" /> Top Themes ({data.top_themes.length})
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {data.top_themes.map((theme: any, i: number) => (
                <div key={i} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{theme.theme}</p>
                    <Badge variant="secondary" className="text-xs">{theme.frequency}</Badge>
                  </div>
                  {theme.example_quotes?.length > 0 && (
                    <div className="space-y-1">
                      {theme.example_quotes.map((q: string, qi: number) => (
                        <p key={qi} className="text-xs text-muted-foreground italic">"{q}"</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {data.voice_fingerprint_seeds?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Fingerprint className="h-3 w-3" /> Voice Fingerprint Seeds
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.voice_fingerprint_seeds.map((phrase: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs font-normal italic">"{phrase}"</Badge>
              ))}
            </div>
          </div>
        )}
        {data.differentiator_signals?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Differentiator Signals
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {data.differentiator_signals.map((sig: any, i: number) => (
                <div key={i} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{sig.signal}</p>
                    <Badge variant="secondary" className="text-xs">{sig.evidence_count} reviews</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{sig.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {data.sentiment_summary && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground">Sentiment Breakdown</p>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-green-600">👍 {data.sentiment_summary.positive_pct}%</span>
              <span className="text-muted-foreground">😐 {data.sentiment_summary.neutral_pct}%</span>
              <span className="text-red-500">👎 {data.sentiment_summary.negative_pct}%</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {data.sentiment_summary.key_positives?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Key Positives</p>
                  <div className="flex flex-wrap gap-1">
                    {data.sentiment_summary.key_positives.map((p: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs text-green-600 border-green-200">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {data.sentiment_summary.key_negatives?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Key Concerns</p>
                  <div className="flex flex-wrap gap-1">
                    {data.sentiment_summary.key_negatives.map((n: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs text-red-500 border-red-200">{n}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
      <DNAJsonEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clinicId={clinicId}
        title="Layer 2 — Review Mining"
        value={data}
        target={{ kind: "additional_field", key: "review_mining" }}
      />
    </Card>
  );
}

/* ── Locality Card ── */
function LocalityCard({ data, clinicId, canEdit }: { data: Record<string, any> | undefined; clinicId?: string; canEdit?: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  if (!data) return null;
  return (
    <Card className="border-emerald-500/20 bg-emerald-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-600" />
            Locality - Neighbourhood Profile
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.confidence && (
              <Badge variant={data.confidence === "high" ? "default" : data.confidence === "medium" ? "secondary" : "destructive"}>
                {data.confidence} confidence
              </Badge>
            )}
            {data.fetched_at && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(data.fetched_at), "MMM d, yyyy h:mm a")}
              </span>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5 h-7 px-2">
                <Edit2 className="h-3 w-3" /> Edit
              </Button>
            )}
          </div>
        </div>
        {data.neighbourhood && (
          <p className="text-xs text-muted-foreground mt-1">
            {data.neighbourhood}{data.formatted_address ? ` - ${data.formatted_address}` : ""}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {data.housing_character && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Home className="h-3 w-3" /> Housing Character</p>
              <p className="text-sm">{data.housing_character}</p>
            </div>
          )}
          {data.commuter_profile && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Car className="h-3 w-3" /> Commuter Profile</p>
              <p className="text-sm">{data.commuter_profile}</p>
            </div>
          )}
        </div>

        {data.local_trails_and_parks?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><TreePine className="h-3 w-3" /> Trails & Parks ({data.local_trails_and_parks.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {data.local_trails_and_parks.map((p: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
              ))}
            </div>
          </div>
        )}

        {data.wildlife_profile?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">🦌 Local Wildlife</p>
            <div className="flex flex-wrap gap-1.5">
              {data.wildlife_profile.map((w: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{w}</Badge>
              ))}
            </div>
          </div>
        )}

        {data.cultural_communities?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Cultural Communities</p>
            <div className="flex flex-wrap gap-1.5">
              {data.cultural_communities.map((c: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
              ))}
            </div>
          </div>
        )}

        {data.community_anchors?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Building className="h-3 w-3" /> Community Anchors</p>
            <div className="flex flex-wrap gap-1.5">
              {data.community_anchors.map((a: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
              ))}
            </div>
          </div>
        )}

        {data.local_landmarks?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Local Landmarks</p>
            <div className="flex flex-wrap gap-1.5">
              {data.local_landmarks.map((l: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{l}</Badge>
              ))}
            </div>
          </div>
        )}

        {data.seasonal_notes && (
          <div className="space-y-1 pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground">🌤️ Seasonal Notes</p>
            <p className="text-sm text-muted-foreground">{data.seasonal_notes}</p>
          </div>
        )}
      </CardContent>
      <DNAJsonEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clinicId={clinicId}
        title="Locality — Neighbourhood Profile"
        value={data}
        target={{ kind: "additional_field", key: "locality" }}
      />
    </Card>
  );
}

function DifferentiatorValidationBadge({
  clinicId,
  profile,
}: {
  clinicId: string | undefined;
  profile: any;
}) {
  const { role } = useUserRole();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [validated, setValidated] = useState<boolean>(!!profile.differentiator_validated);
  const [note, setNote] = useState<string>(profile.differentiator_validation_note || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValidated(!!profile.differentiator_validated);
    setNote(profile.differentiator_validation_note || "");
  }, [profile.differentiator_validated, profile.differentiator_validation_note]);

  const isStaff = role === "admin" || role === "concierge";
  const isManual = !!profile.differentiator_validated_by;

  const label = profile.differentiator_validated
    ? isManual
      ? "✓ Manually validated"
      : "✓ Review-validated"
    : "⚠ Not validated";

  const variant: "default" | "destructive" | "secondary" = profile.differentiator_validated
    ? isManual
      ? "secondary"
      : "default"
    : "destructive";

  const handleSave = async () => {
    if (!clinicId || !user) return;
    setSaving(true);
    try {
      const updated = {
        ...profile,
        differentiator_validated: validated,
        differentiator_validated_by: validated ? user.id : null,
        differentiator_validated_at: validated ? new Date().toISOString() : null,
        differentiator_validation_note: validated ? note.trim() : "",
      };
      const { error } = await supabase
        .from("clinic_brand_dna")
        .update({ synthesized_profile: updated as any })
        .eq("clinic_id", clinicId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["brand-dna", clinicId] });
      toast.success(validated ? "Marked as validated" : "Marked as not validated");
      setOpen(false);
    } catch (e: any) {
      toast.error("Save failed", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (profile.differentiator_validated === undefined && !isStaff) return null;

  if (!isStaff) {
    return (
      <Badge variant={variant} className="ml-1 text-[10px]">
        {label}
      </Badge>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
          aria-label="Manage differentiator validation"
        >
          <Badge variant={variant} className="text-[10px] cursor-pointer">
            {label}
          </Badge>
          <Shield className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Differentiator validation</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Confirm after a human review (e.g. client call, owner email).
            </p>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="diff-validated" className="text-sm">
              Mark as validated
            </Label>
            <Switch id="diff-validated" checked={validated} onCheckedChange={setValidated} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="diff-note" className="text-xs text-muted-foreground">
              Validation note (optional)
            </Label>
            <Textarea
              id="diff-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Confirmed with Dr. Parveen via call on Apr 19"
              className="text-sm"
              disabled={!validated}
            />
          </div>
          {profile.differentiator_validated_at && (
            <p className="text-[10px] text-muted-foreground">
              Last updated {format(new Date(profile.differentiator_validated_at), "MMM d, yyyy")}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
