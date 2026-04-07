import { useBrandDNA } from "@/hooks/useBrandDNA";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dna, CheckCircle, AlertCircle, Clock, Globe, RefreshCw, User, Stethoscope, Building, Star, MessageSquareQuote, Fingerprint, TrendingUp } from "lucide-react";
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
  const { dna, isLoading, extractWebsite, mineReviews } = useBrandDNA(clinicId);

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mineReviews.mutate()}
            disabled={mineReviews.isPending}
            className="gap-2"
          >
            {mineReviews.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Star className="h-4 w-4" />
            )}
            {mineReviews.isPending ? "Mining..." : reviewMining ? "Re-mine Reviews" : "Mine Google Reviews"}
          </Button>
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
      </div>

      {/* Layer 1: Website Extraction */}
      <WebsiteExtractionCard data={websiteExtraction} />

      {/* Layer 2: Review Mining */}
      <ReviewMiningCard data={reviewMining} />

      {/* No DNA and no extraction */}
      {!dna && !websiteExtraction && !reviewMining && (
        <Card>
          <CardContent className="py-12 text-center">
            <Dna className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No Brand DNA has been submitted for this clinic yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Extract from Website" or "Mine Google Reviews" to auto-fill Layers 1 & 2, or wait for the client to complete the questionnaire.</p>
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
        {/* Top Themes */}
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

        {/* Voice Fingerprint Seeds */}
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

        {/* Differentiator Signals */}
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

        {/* Sentiment Summary */}
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
