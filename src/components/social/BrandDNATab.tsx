import { useBrandDNA } from "@/hooks/useBrandDNA";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dna, CheckCircle, AlertCircle, Clock, Globe, RefreshCw, User,
  Stethoscope, Building, Star, MessageSquareQuote, Fingerprint,
  TrendingUp, Sparkles, Shield, Scale, BookOpen, Target, Ban,
  Users, Camera, CalendarClock, CheckSquare, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

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
  const { dna, isLoading, extractWebsite, mineReviews, synthesizeDNA } = useBrandDNA(clinicId);

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
  const synthesizedProfile = (dna?.synthesized_profile || {}) as Record<string, any>;
  const hasSynthesis = synthesizedProfile && Object.keys(synthesizedProfile).length > 0 && synthesizedProfile.voice_fingerprint;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Dna className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Brand DNA Profile</h2>
            {dna && (
              <div className="flex items-center gap-2 mt-0.5">
                <StatusIcon status={dna.status} />
                <span className="text-xs text-muted-foreground capitalize">{dna.status}</span>
                <ScoreBadge score={dna.completeness_score || Math.round((answeredCount / 10) * 100)} />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => synthesizeDNA.mutate()}
            disabled={synthesizeDNA.isPending || !dna}
            className="gap-2"
          >
            {synthesizeDNA.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {synthesizeDNA.isPending ? "Synthesizing..." : hasSynthesis ? "Re-synthesize" : "Synthesize DNA"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mineReviews.mutate()}
            disabled={mineReviews.isPending}
            className="gap-2"
          >
            {mineReviews.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
            {mineReviews.isPending ? "Mining..." : reviewMining ? "Re-mine" : "Mine Reviews"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => extractWebsite.mutate()}
            disabled={extractWebsite.isPending}
            className="gap-2"
          >
            {extractWebsite.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            {extractWebsite.isPending ? "Extracting..." : websiteExtraction ? "Re-extract" : "Extract Website"}
          </Button>
        </div>
      </div>

      {/* Synthesized Profile */}
      {hasSynthesis && <SynthesizedProfileCard profile={synthesizedProfile} />}

      {/* Layer 1: Website Extraction */}
      <WebsiteExtractionCard data={websiteExtraction} />

      {/* Layer 2: Review Mining */}
      <ReviewMiningCard data={reviewMining} />

      {/* No DNA */}
      {!dna && !websiteExtraction && !reviewMining && (
        <Card>
          <CardContent className="py-12 text-center">
            <Dna className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No Brand DNA has been submitted for this clinic yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Extract Website" or "Mine Reviews" to auto-fill Layers 1 & 2, or wait for the client to complete the questionnaire.</p>
          </CardContent>
        </Card>
      )}

      {/* Layer 3: Q&A Cards */}
      {dna && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Dna className="h-4 w-4" />
            Layer 3 — Collection Call Answers
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(QUESTION_LABELS).map(([key, label]) => (
              <Card key={key} className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground">
                    {callNotes[key] || <span className="italic text-muted-foreground">Not answered</span>}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {Object.entries(ADDITIONAL_LABELS).some(([key]) => {
            const val = additionalFields[key];
            return val && typeof val === "string" && val.trim();
          }) && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground mt-4">Additional Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(ADDITIONAL_LABELS).map(([key, label]) => {
                  const val = additionalFields[key];
                  if (!val || typeof val !== "string" || !val.trim()) return null;
                  return (
                    <Card key={key} className="border-border/60">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-foreground">{val}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Synthesized Profile Card ── */
function SynthesizedProfileCard({ profile }: { profile: Record<string, any> }) {
  const score = profile.completeness_score || 0;
  const scoreColor = score >= 90 ? "text-green-600" : score >= 70 ? "text-amber-600" : "text-red-600";
  const scoreLabel = score >= 90 ? "Full Generation Ready" : score >= 70 ? "Generate with Warnings" : score >= 50 ? "Limited Generation" : "Do Not Activate";

  return (
    <Card className="border-violet-500/20 bg-violet-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Synthesized DNA Profile
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className={`text-lg font-bold ${scoreColor}`}>{Math.round(score)}%</span>
              <p className="text-xs text-muted-foreground">{scoreLabel}</p>
            </div>
            {profile.synthesized_at && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(profile.synthesized_at), "MMM d, yyyy h:mm a")}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
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
              {profile.differentiator_validated !== undefined && (
                <Badge variant={profile.differentiator_validated ? "default" : "destructive"} className="ml-1 text-[10px]">
                  {profile.differentiator_validated ? "✓ Review-validated" : "⚠ Not validated"}
                </Badge>
              )}
            </p>
            <p className="text-sm">{profile.clinic_differentiator}</p>
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
                <Badge key={i} variant="outline" className="text-xs">{c.name}{c.relationship ? ` — ${c.relationship}` : ""}</Badge>
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

        {/* Vedant Review Checklist */}
        {profile.vedant_review_checklist?.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-border/50">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <CheckSquare className="h-3 w-3 text-violet-500" /> Vedant Review Checklist
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
    </Card>
  );
}

/* ── Layer 1 Card ── */
function WebsiteExtractionCard({ data }: { data: Record<string, any> | undefined }) {
  if (!data) return null;
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Layer 1 — Website Extraction
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
    </Card>
  );
}

/* ── Layer 2 Card ── */
function ReviewMiningCard({ data }: { data: Record<string, any> | undefined }) {
  if (!data) return null;
  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Layer 2 — Review Mining
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
    </Card>
  );
}
