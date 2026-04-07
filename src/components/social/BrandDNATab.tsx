import { useBrandDNA } from "@/hooks/useBrandDNA";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dna, CheckCircle, AlertCircle, Clock } from "lucide-react";

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
  const { dna, isLoading } = useBrandDNA(clinicId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!dna) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Dna className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No Brand DNA has been submitted for this clinic yet.</p>
          <p className="text-xs text-muted-foreground mt-1">The client will be prompted to fill this out when they first visit the Social Media department.</p>
        </CardContent>
      </Card>
    );
  }

  const callNotes = (dna.call_notes || {}) as Record<string, string>;
  const additionalFields = (dna.additional_fields || {}) as Record<string, string>;
  const answeredCount = Object.values(callNotes).filter((v) => v && v.trim()).length;

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
            <div className="flex items-center gap-2 mt-0.5">
              <StatusIcon status={dna.status} />
              <span className="text-xs text-muted-foreground capitalize">{dna.status}</span>
              <ScoreBadge score={Math.round((answeredCount / 10) * 100)} />
            </div>
          </div>
        </div>
      </div>

      {/* Q&A Cards */}
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
      {Object.values(additionalFields).some((v) => v && v.trim()) && (
        <>
          <h3 className="text-sm font-semibold text-muted-foreground mt-4">Additional Details</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(ADDITIONAL_LABELS).map(([key, label]) => {
              const val = additionalFields[key];
              if (!val?.trim()) return null;
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
    </div>
  );
}
