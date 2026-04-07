import { useBrandDNA } from "@/hooks/useBrandDNA";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dna, CheckCircle, AlertCircle, Clock, Globe, RefreshCw, User, Stethoscope, Building } from "lucide-react";
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
  const { dna, isLoading, extractWebsite } = useBrandDNA(clinicId);

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
                <ScoreBadge score={Math.round((answeredCount / 10) * 100)} />
              </div>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => extractWebsite.mutate()}
          disabled={extractWebsite.isPending}
          className="gap-2"
        >
          {extractWebsite.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          {extractWebsite.isPending ? "Extracting..." : websiteExtraction ? "Re-extract from Website" : "Extract from Website"}
        </Button>
      </div>

      {/* Layer 1: Website Extraction */}
      {websiteExtraction && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Layer 1 — Website Extraction
              </CardTitle>
              <div className="flex items-center gap-2">
                {websiteExtraction.confidence && (
                  <Badge variant={websiteExtraction.confidence === "high" ? "default" : websiteExtraction.confidence === "medium" ? "secondary" : "destructive"}>
                    {websiteExtraction.confidence} confidence
                  </Badge>
                )}
                {websiteExtraction.extracted_at && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(websiteExtraction.extracted_at), "MMM d, yyyy h:mm a")}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Hospital Name */}
              {websiteExtraction.hospital_name && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Building className="h-3 w-3" /> Hospital Name
                  </p>
                  <p className="text-sm">{websiteExtraction.hospital_name}</p>
                </div>
              )}
              {/* Phone */}
              {websiteExtraction.phone && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Phone</p>
                  <p className="text-sm">{websiteExtraction.phone}</p>
                </div>
              )}
              {/* Hours */}
              {websiteExtraction.hours && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Hours</p>
                  <p className="text-sm">{websiteExtraction.hours}</p>
                </div>
              )}
              {/* Founding Year */}
              {websiteExtraction.founding_year && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Founded</p>
                  <p className="text-sm">{websiteExtraction.founding_year}</p>
                </div>
              )}
              {/* Booking URL */}
              {websiteExtraction.booking_url && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Booking URL</p>
                  <a href={websiteExtraction.booking_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline truncate block">
                    {websiteExtraction.booking_url}
                  </a>
                </div>
              )}
            </div>

            {/* Doctors */}
            {websiteExtraction.doctors?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Doctors & Staff ({websiteExtraction.doctors.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {websiteExtraction.doctors.map((doc: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {doc.name}{doc.credentials ? `, ${doc.credentials}` : ""}{doc.role ? ` (${doc.role})` : ""}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Services */}
            {websiteExtraction.services_list?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Stethoscope className="h-3 w-3" /> Services ({websiteExtraction.services_list.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {websiteExtraction.services_list.map((svc: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{svc}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* About Us */}
            {websiteExtraction.about_us_content && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">About Us</p>
                <p className="text-sm text-muted-foreground">{websiteExtraction.about_us_content}</p>
              </div>
            )}

            {/* Brand Identity */}
            {websiteExtraction.brand_identity && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Brand Identity</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {websiteExtraction.brand_identity.tagline && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Tagline</p>
                      <p className="text-sm italic">"{websiteExtraction.brand_identity.tagline}"</p>
                    </div>
                  )}
                  {websiteExtraction.brand_identity.tone && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Tone</p>
                      <p className="text-sm capitalize">{websiteExtraction.brand_identity.tone}</p>
                    </div>
                  )}
                  {websiteExtraction.brand_identity.values?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Values</p>
                      <div className="flex flex-wrap gap-1">
                        {websiteExtraction.brand_identity.values.map((v: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{v}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Source URLs */}
            {websiteExtraction.source_urls?.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  Scraped {websiteExtraction.source_urls.length} page(s)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No DNA and no extraction */}
      {!dna && !websiteExtraction && (
        <Card>
          <CardContent className="py-12 text-center">
            <Dna className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No Brand DNA has been submitted for this clinic yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Extract from Website" to auto-fill Layer 1, or wait for the client to complete the questionnaire.</p>
          </CardContent>
        </Card>
      )}

      {/* Layer 3: Q&A Cards (Collection Call) */}
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

          {/* Additional Fields */}
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
